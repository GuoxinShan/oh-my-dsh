//! Windows process-tree helpers: a Job Object with KILL_ON_JOB_CLOSE so a
//! dead shell takes the sidecar tree with it, plus a start-time token for
//! the stale-sidecar registry (pid reuse guard).
//!
//! Assigning the sidecar to the job can fail when the parent is already in
//! a job that forbids breakaway (some CI / IDE hosts). Callers then fall
//! back to `taskkill /T` and the next-boot registry sweep.

use std::os::windows::io::AsRawHandle;
use std::process::Child;
use std::sync::OnceLock;

use crate::hide_console;

static JOB: OnceLock<JobHandle> = OnceLock::new();

struct JobHandle(*mut core::ffi::c_void);

unsafe impl Send for JobHandle {}
unsafe impl Sync for JobHandle {}

impl Drop for JobHandle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CloseHandle(self.0) };
        }
    }
}

const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION: u32 = 9;
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x2000;

#[repr(C)]
struct FileTime {
    lo: u32,
    hi: u32,
}

#[repr(C)]
struct JobObjectBasicLimitInformation {
    per_process_user_time_limit: i64,
    per_job_user_time_limit: i64,
    limit_flags: u32,
    minimum_working_set_size: usize,
    maximum_working_set_size: usize,
    active_process_limit: u32,
    affinity: usize,
    priority_class: u32,
    scheduling_class: u32,
}

#[repr(C)]
struct IoCounters {
    read_operation_count: u64,
    write_operation_count: u64,
    other_operation_count: u64,
    read_transfer_count: u64,
    write_transfer_count: u64,
    other_transfer_count: u64,
}

#[repr(C)]
struct JobObjectExtendedLimitInformation {
    basic: JobObjectBasicLimitInformation,
    io: IoCounters,
    process_memory_limit: usize,
    job_memory_limit: usize,
    peak_process_memory_used: usize,
    peak_job_memory_used: usize,
}

#[link(name = "kernel32")]
extern "system" {
    fn OpenProcess(desired: u32, inherit: i32, pid: u32) -> *mut core::ffi::c_void;
    fn CloseHandle(handle: *mut core::ffi::c_void) -> i32;
    fn GetProcessTimes(
        handle: *mut core::ffi::c_void,
        creation: *mut FileTime,
        exit: *mut FileTime,
        kernel: *mut FileTime,
        user: *mut FileTime,
    ) -> i32;
    fn GetExitCodeProcess(handle: *mut core::ffi::c_void, code: *mut u32) -> i32;
    fn CreateJobObjectW(attr: *mut core::ffi::c_void, name: *const u16) -> *mut core::ffi::c_void;
    fn SetInformationJobObject(
        job: *mut core::ffi::c_void,
        class: u32,
        info: *mut core::ffi::c_void,
        len: u32,
    ) -> i32;
    fn AssignProcessToJobObject(job: *mut core::ffi::c_void, process: *mut core::ffi::c_void) -> i32;
    fn TerminateJobObject(job: *mut core::ffi::c_void, exit_code: u32) -> i32;
    fn GetLastError() -> u32;
}

/// Assign `child` to the process-wide kill-on-close job. Failure is
/// non-fatal: the sidecar still runs, termination falls back to taskkill.
pub fn assign_sidecar_to_job(child: &Child) -> Result<(), String> {
    let job = JOB.get_or_init(create_job);
    if job.0.is_null() {
        return Err("CreateJobObjectW failed".into());
    }
    let process = child.as_raw_handle() as *mut core::ffi::c_void;
    let ok = unsafe { AssignProcessToJobObject(job.0, process) };
    if ok == 0 {
        Err(format!(
            "AssignProcessToJobObject failed (err {})",
            unsafe { GetLastError() }
        ))
    } else {
        Ok(())
    }
}

/// Kill every process currently in the job. No-op when the job was never
/// created or assignment failed at spawn.
pub fn terminate_job() {
    if let Some(job) = JOB.get() {
        if !job.0.is_null() {
            unsafe { TerminateJobObject(job.0, 1) };
        }
    }
}

/// FILETIME creation stamp as a decimal string, or `None` when the pid
/// does not exist / cannot be queried. Compared for equality only.
pub fn start_token(pid: u32) -> Option<String> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return None;
        }
        let mut creation = FileTime { lo: 0, hi: 0 };
        let mut exit = FileTime { lo: 0, hi: 0 };
        let mut kernel = FileTime { lo: 0, hi: 0 };
        let mut user = FileTime { lo: 0, hi: 0 };
        let ok = GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user);
        let mut code = 0u32;
        let exit_ok = GetExitCodeProcess(handle, &mut code);
        CloseHandle(handle);
        if ok == 0 || exit_ok == 0 {
            return None;
        }
        // STILL_ACTIVE (259): an exited process object can linger while
        // someone still holds a handle; GetProcessTimes would otherwise
        // keep reporting the dead pid as alive (the unix `ps` equivalent
        // disappears as soon as the process is reaped).
        const STILL_ACTIVE: u32 = 259;
        if code != STILL_ACTIVE {
            return None;
        }
        let ticks = ((creation.hi as u64) << 32) | (creation.lo as u64);
        Some(ticks.to_string())
    }
}

/// `taskkill /T` the pid tree. `/F` is the SIGKILL analogue; without it
/// Windows posts WM_CLOSE (the SIGTERM analogue) and we wait the grace
/// period before escalating.
pub fn taskkill_tree(pid: u32, force: bool) {
    let mut command = std::process::Command::new("taskkill");
    if force {
        command.arg("/F");
    }
    command.args(["/T", "/PID", &pid.to_string()]);
    hide_console(&mut command);
    let _ = command.stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).status();
}

fn create_job() -> JobHandle {
    unsafe {
        let handle = CreateJobObjectW(std::ptr::null_mut(), std::ptr::null());
        if handle.is_null() {
            eprintln!("dsh-desktop: CreateJobObjectW failed (err {})", GetLastError());
            return JobHandle(std::ptr::null_mut());
        }
        let mut info: JobObjectExtendedLimitInformation = std::mem::zeroed();
        info.basic.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let ok = SetInformationJobObject(
            handle,
            JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
            &mut info as *mut _ as *mut core::ffi::c_void,
            std::mem::size_of::<JobObjectExtendedLimitInformation>() as u32,
        );
        if ok == 0 {
            eprintln!("dsh-desktop: SetInformationJobObject failed (err {})", GetLastError());
            CloseHandle(handle);
            return JobHandle(std::ptr::null_mut());
        }
        JobHandle(handle)
    }
}
