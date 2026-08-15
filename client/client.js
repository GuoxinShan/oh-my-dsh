/**
 * dsh-provider-balance — browser half (served as /plugins/dsh-provider-balance/client.js).
 *
 * Hand-written client bundle in the DSH module handoff format: the classic
 * script registers one factory with window.__ModuleLoader__; the factory
 * resolves its few dependencies through the injected require (the frozen
 * platform module table — react and the shared UI primitives), injects its
 * stylesheet (the module system claims untagged <style> tags for this plugin
 * and removes them on unload), and exports the Cordis plugin.
 *
 * Contribution: one entry in the `conversation.input.right` list slot — the
 * tool row inside the composer card, immediately left of the model select and
 * the context ring. The chip FOLLOWS the session's current model selection:
 * it reads the selected provider from the shared per-session model directory
 * (the same store ModelSelect renders from) and shows only that provider's
 * remaining quotas. A provider without a quota adapter renders nothing.
 *
 * Data comes from the host half's same-origin JSON route
 * (`/provider-balance/quota?provider=<route-id>`); the API key never crosses
 * to the browser.
 */
window.__ModuleLoader__.load({
  id: 'dsh-provider-balance',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports

    var React = require('react')
    var createElement = React.createElement
    var useState = React.useState
    var useEffect = React.useEffect
    var useRef = React.useRef
    var useCallback = React.useCallback
    var Tooltip = require('@deepseek-ai/dsh-client-ui-primitives').Tooltip

    /* ------------------------------------------------------------------ */
    /* Stylesheet (plain class names on a dpb- prefix; the module system   */
    /* claims this tag during materialization and drops it on unload).     */
    /* ------------------------------------------------------------------ */
    if (typeof document !== 'undefined'
      && document.querySelector('style[data-plugin-css="dsh-provider-balance/client.css"]') === null) {
      var style = document.createElement('style')
      style.dataset.plugin = 'dsh-provider-balance'
      style.dataset.pluginCss = 'dsh-provider-balance/client.css'
      style.textContent = [
        '.dpb-root { position: relative; display: inline-flex; }',
        '.dpb-trigger {',
        '  display: inline-flex; align-items: center; gap: 4px; flex: none;',
        '  height: 28px; padding: 0 8px; margin-right: 2px;',
        '  border: none; border-radius: 999px; background: transparent;',
        '  color: var(--dsw-alias-label-secondary); cursor: pointer;',
        /* Typography identical to the sibling ModelSelect trigger: 13/20
         * medium, so the chip's text reads on the same baseline as the model
         * name beside it. */
        '  font-size: 13px; line-height: 20px; font-weight: 500; font-variant-numeric: tabular-nums;',
        '  white-space: nowrap;',
        '}',
        '.dpb-trigger:hover { background: var(--dsw-alias-interactive-bg-hover); }',
        '.dpb-num { color: var(--dpb-tint, var(--dsw-alias-label-primary)); font-weight: 500; }',
        '.dpb-sep { color: var(--dsw-alias-label-tertiary); }',
        '.dpb-tools { color: var(--dsw-alias-label-secondary); font-weight: 400; }',
        '.dpb-level-ok { --dpb-tint: var(--dsw-alias-label-primary); }',
        '.dpb-level-warn { --dpb-tint: var(--dsw-static-amber-500); }',
        '.dpb-level-low { --dpb-tint: var(--dsw-static-red-500); }',
        '.dpb-panel {',
        '  position: absolute; bottom: calc(100% + 8px); right: 0; z-index: 100;',
        '  box-sizing: border-box; width: 288px; padding: 12px;',
        '  border: 1px solid var(--dsw-alias-border-inverted); border-radius: 12px;',
        '  background: var(--dsw-specific-menu); box-shadow: var(--dsw-shadow-lv3);',
        '  font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary);',
        '  cursor: default;',
        '}',
        '.dpb-head { display: flex; align-items: center; gap: 6px; padding-right: 24px; }',
        '.dpb-title { font-weight: 500; color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
        '.dpb-sub { color: var(--dsw-alias-label-tertiary); font-size: 11px; }',
        '.dpb-refresh {',
        '  position: absolute; top: 8px; right: 8px; width: 22px; height: 22px;',
        '  display: grid; place-items: center; border: none; border-radius: 999px;',
        '  background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer;',
        '}',
        '.dpb-refresh:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }',
        '.dpb-refresh:disabled { cursor: default; opacity: 0.5; }',
        '.dpb-refresh:disabled:hover { background: transparent; }',
        '.dpb-row { margin-top: 8px; }',
        '.dpb-rowhead { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }',
        '.dpb-rowlabel { color: var(--dsw-alias-label-secondary); }',
        '.dpb-rowvalue { font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }',
        '.dpb-hint { color: var(--dsw-alias-label-tertiary); font-size: 11px; text-align: right; }',
        '.dpb-bar { display: flex; gap: 1px; margin-top: 4px; height: 4px; border-radius: 999px;',
        '  background: var(--dsw-alias-interactive-bg-hover); overflow: hidden; }',
        '.dpb-barused { flex: none; height: 100%; border-radius: 1px; background: var(--dpb-row-tint, var(--dsw-alias-label-tertiary)); }',
        /* Per-window identity tints: blue = 5h, green = weekly, purple = tools.
           Purple has no design-platform static token (same as ContextMeter's
           violet-400 literal). */
        '.dpb-c-blue { --dpb-row-tint: var(--dsw-static-blue-450); }',
        '.dpb-c-green { --dpb-row-tint: var(--dsw-static-green-500); }',
        '.dpb-c-purple { --dpb-row-tint: rgb(167, 139, 250); }',
        '.dpb-swatch { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 6px; background: var(--dpb-row-tint); vertical-align: baseline; }',
        '.dpb-breakdown { margin-top: 2px; color: var(--dsw-alias-label-tertiary); font-size: 11px;',
        '  font-variant-numeric: tabular-nums; }',
        '.dpb-stale { margin-top: 10px; color: var(--dsw-static-amber-500); font-size: 11px; }',
        '.dpb-error { margin-top: 6px; color: var(--dsw-static-red-500); font-size: 11px; }',
        '.dpb-foot { margin-top: 10px; color: var(--dsw-alias-label-tertiary); font-size: 11px;',
        '  display: flex; align-items: center; justify-content: space-between; gap: 8px; }',
      ].join('\n')
      document.head.appendChild(style)
    }

    /* ------------------------------------------------------------------ */
    /* Copy. One namespace, zh + en dictionaries; registered on ctx.locale */
    /* and delivered to the slot component as the `t` prop.                */
    /* ------------------------------------------------------------------ */
    var NS = 'providerBalance'
    var DICTS = {
      zh: {
        'chip.title': '供应商余量',
        'chip.5h': '5小时',
        'chip.week': '本周',
        'chip.tools': '工具',
        'panel.5h': '5 小时窗口',
        'panel.week': '本周窗口',
        'panel.month': '本月窗口',
        'panel.tools': '工具 / 网页搜索',
        'panel.remaining': '剩余',
        'panel.used': '已用',
        'panel.calls': '次',
        'panel.resetIn': '后重置',
        'panel.resetAt': '重置于',
        'panel.refreshedAt': '更新于',
        'panel.stale': '数据可能已过期（上次成功获取后刷新失败）',
        'panel.refresh': '刷新',
        'error.missing-key': '未配置 API Key（凭据或环境变量）',
        'error.auth': 'API Key 被拒绝，请检查供应商凭据',
        'error.http': '上游接口返回错误',
        'error.timeout': '请求超时',
        'error.network': '网络错误',
        'error.parse': '响应格式异常',
        'error.unknown': '未知错误',
        'error.fetch': '读取余量失败',
      },
      en: {
        'chip.title': 'Provider balance',
        'chip.5h': '5h',
        'chip.week': 'week',
        'chip.tools': 'tools',
        'panel.5h': '5-hour window',
        'panel.week': 'Weekly window',
        'panel.month': 'Monthly window',
        'panel.tools': 'Tools / web search',
        'panel.remaining': 'left',
        'panel.used': 'used',
        'panel.calls': 'calls',
        'panel.resetIn': 'to reset',
        'panel.resetAt': 'resets',
        'panel.refreshedAt': 'updated',
        'panel.stale': 'Data may be stale (last refresh failed)',
        'panel.refresh': 'Refresh',
        'error.missing-key': 'API key not configured (credential or env)',
        'error.auth': 'API key rejected; check the provider credential',
        'error.http': 'Upstream endpoint error',
        'error.timeout': 'Request timed out',
        'error.network': 'Network error',
        'error.parse': 'Unexpected response shape',
        'error.unknown': 'Unknown error',
        'error.fetch': 'Failed to load balance',
      },
    }

    var QUOTA_URL = '/provider-balance/quota'
    var POLL_MS = 5 * 60 * 1000

    /** DSH provider route id → display label. Route identity, not business
     * data: shown only when the upstream API returns no product name. */
    var SHORT_NAMES = { 'zai-coding-cn': 'GLM', 'kimi-coding': 'Kimi Code', 'opencode-go': 'OpenCode Go', 'deepseek-official': 'DeepSeek', 'moonshot-platform': 'Moonshot', 'xai': 'xAI' }

    /** Remaining-percent → visual level class. */
    function levelOf(remainingPercent) {
      if (remainingPercent === undefined) return 'dpb-level-ok'
      if (remainingPercent < 20) return 'dpb-level-low'
      if (remainingPercent < 50) return 'dpb-level-warn'
      return 'dpb-level-ok'
    }

    /** Compact "1h 23m" / "2d 4h" countdown for epoch-ms deadlines. */
    function formatCountdown(resetAt, now) {
      if (typeof resetAt !== 'number') return ''
      var ms = resetAt - now
      if (ms <= 0) return ''
      var minutes = Math.floor(ms / 60000)
      var days = Math.floor(minutes / 1440)
      var hours = Math.floor((minutes % 1440) / 60)
      var mins = minutes % 60
      if (days > 0) return days + 'd ' + hours + 'h'
      if (hours > 0) return hours + 'h ' + mins + 'm'
      return mins + 'm'
    }

    function formatClock(iso) {
      var date = new Date(iso)
      if (Number.isNaN(date.getTime())) return ''
      var pad = function (n) { return (n < 10 ? '0' : '') + n }
      return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds())
    }

    function formatDate(resetAt) {
      var date = new Date(resetAt)
      if (Number.isNaN(date.getTime())) return ''
      var pad = function (n) { return (n < 10 ? '0' : '') + n }
      return date.getMonth() + 1 + '-' + pad(date.getDate())
    }

    function errorMessage(error, t) {
      if (error === undefined || error === null) return ''
      var key = 'error.' + String(error.code || 'unknown')
      return t(key in DICTS.zh ? key : 'error.unknown') + (error.message ? ': ' + error.message : '')
    }

    function labelWithSwatch(label) {
      return [
        createElement('span', { key: 'sw', className: 'dpb-swatch', 'aria-hidden': 'true' }),
        label,
      ]
    }

    /* ------------------------------------------------------------------ */
    /* Panel rows.                                                        */
    /* ------------------------------------------------------------------ */
    function WindowRow(props) {
      var label = props.label
      var value = props.value /* QuotaWindow */
      var t = props.t
      var now = props.now
      if (value === undefined || value === null) return null
      var remaining = value.remainingPercent
      var countdown = formatCountdown(value.resetAt, now)
      /* A non-ok upstream window status rides along on the hint line. */
      var status = typeof value.status === 'string' && value.status !== 'ok' ? ' · ' + value.status : ''
      var usedText = t('panel.remaining') + ' ' + remaining + '%'
      if (value.totalTokens !== undefined && value.totalTokens > 0) {
        usedText += ' · ' + t('panel.used') + ' ' + Math.round(value.usedPercent) + '%'
      }
      return createElement('div', { className: 'dpb-row ' + (props.colorClass || '') },
        createElement('div', { className: 'dpb-rowhead' },
          createElement('span', { className: 'dpb-rowlabel' }, labelWithSwatch(label)),
          createElement('span', { className: 'dpb-rowvalue' }, usedText)),
        createElement('div', { className: 'dpb-bar' },
          createElement('div', { className: 'dpb-barused', style: { width: Math.max(2, value.usedPercent) + '%' } })),
        countdown
          ? createElement('div', { className: 'dpb-hint' }, countdown + ' ' + t('panel.resetIn') + status)
          : (status ? createElement('div', { className: 'dpb-hint' }, status.slice(3)) : null))
    }

    /* Prepaid balance row. Text colors stay the panel defaults (same as every
     * other row); only the identity SWATCH is green, like the window rows'
     * blue/green/purple swatches. */
    function BalanceRow(props) {
      var balance = props.balance
      if (balance == null) return null
      var symbol = balance.currency === 'USD' ? '$' : '¥'
      var parts = []
      if (balance.granted != null && isFinite(balance.granted)) parts.push('赠金 ' + symbol + balance.granted.toFixed(2))
      if (balance.toppedUp != null && isFinite(balance.toppedUp)) parts.push('充值 ' + symbol + balance.toppedUp.toFixed(2))
      if (balance.usedToday != null && isFinite(balance.usedToday)) parts.push('今日已用 ' + symbol + balance.usedToday.toFixed(2))
      return createElement('div', { className: 'dpb-row dpb-c-green' },
        createElement('div', { className: 'dpb-rowhead' },
          createElement('span', { className: 'dpb-rowlabel' },
            labelWithSwatch(balance.currency === 'USD' ? '余额 (USD)' : '余额 (CNY)')),
          createElement('span', { className: 'dpb-rowvalue' },
            symbol + (isFinite(balance.total) ? balance.total.toFixed(2) : '—'))),
        parts.length > 0
          ? createElement('div', { className: 'dpb-breakdown' }, parts.join(' · '))
          : null,
        balance.isAvailable === false
          ? createElement('div', { className: 'dpb-breakdown' }, '余额不可用于 API 调用')
          : null)
    }

    function ToolsRow(props) {
      var t = props.t
      var tools = props.tools
      if (tools === undefined || tools === null) return null
      var breakdown = (tools.breakdown || []).map(function (item) { return item.code + ' ' + item.used }).join(' · ')
      return createElement('div', { className: 'dpb-row dpb-c-purple' },
        createElement('div', { className: 'dpb-rowhead' },
          createElement('span', { className: 'dpb-rowlabel' }, labelWithSwatch(t('panel.tools'))),
          createElement('span', { className: 'dpb-rowvalue' },
            t('panel.remaining') + ' ' + tools.remaining + '/' + tools.limit + ' ' + t('panel.calls'))),
        tools.limit > 0
          ? createElement('div', { className: 'dpb-bar' },
              createElement('div', { className: 'dpb-barused', style: { width: Math.max(2, Math.min(100, (tools.used / tools.limit) * 100)) + '%' } }))
          : null,
        breakdown
          ? createElement('div', { className: 'dpb-breakdown' }, breakdown)
          : null,
        typeof tools.resetAt === 'number'
          ? createElement('div', { className: 'dpb-hint' }, t('panel.resetAt') + ' ' + formatDate(tools.resetAt))
          : null)
    }

    /* ------------------------------------------------------------------ */
    /* The chip: follows the session's CURRENT model provider. `data` is  */
    /* the host snapshot for exactly that provider; a provider without a  */
    /* quota adapter renders nothing at all.                              */
    /* ------------------------------------------------------------------ */
    function ProviderBalanceChip(props) {
      var t = props.t
      var sessionId = props.sessionId

      /* Current model selection's provider, live from the shared per-session
       * model directory (the same store ModelSelect renders from). */
      var providerState = useState(undefined)
      var provider = providerState[0]
      var setProvider = providerState[1]

      /* modelDirectories is resolved lazily per effect run: the service may
       * activate after this plugin loads. */
      var getModelDirectories = props.getModelDirectories

      useEffect(function () {
        var directories = getModelDirectories()
        if (directories === undefined) return undefined
        var directory
        try {
          directory = directories.directoryFor(sessionId)
        } catch (error) {
          return undefined
        }
        var read = function () {
          var current = directory.store.getSnapshot().current
          setProvider(current !== null && current !== undefined ? current.provider : undefined)
        }
        read()
        return directory.store.subscribe(read)
      }, [sessionId])

      var dataState = useState(null)
      var data = dataState[0]
      var setData = dataState[1]
      var loadingState = useState(false)
      var loading = loadingState[0]
      var setLoading = loadingState[1]
      var openState = useState(false)
      var open = openState[0]
      var setOpen = openState[1]
      var tick = useState(0)
      var setTick = tick[1]
      var rootRef = useRef(null)

      var load = useCallback(function (force) {
        if (provider === undefined) return
        setLoading(true)
        fetch(QUOTA_URL + '?provider=' + encodeURIComponent(provider) + (force ? '&refresh=1' : ''), {
          headers: { Accept: 'application/json' },
        })
          .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status)
            return response.json()
          })
          .then(function (body) {
            var sources = (body && body.sources) || []
            setData(sources.length > 0
              ? Object.assign({ provider: provider }, sources[0])
              : { provider: provider, unsupported: true })
          })
          .catch(function () {
            setData({ provider: provider, ok: false, error: { code: 'fetch', message: '' } })
          })
          .finally(function () { setLoading(false) })
      }, [provider])

      /* Provider switch resets the chip; first load + gentle polling. */
      useEffect(function () {
        setData(null)
        setOpen(false)
        if (provider === undefined) return undefined
        load(false)
        var timer = setInterval(function () { load(false) }, POLL_MS)
        return function () { clearInterval(timer) }
      }, [provider, load])

      /* Slow clock while the panel is open: countdowns stay fresh. */
      useEffect(function () {
        if (!open) return undefined
        var timer = setInterval(function () { setTick(function (n) { return n + 1 }) }, 30 * 1000)
        return function () { clearInterval(timer) }
      }, [open])

      /* Outside click / Escape close (ContextMeter's pattern). */
      useEffect(function () {
        if (!open) return undefined
        var onPointerDown = function (event) {
          if (rootRef.current !== null && event.target instanceof Node && rootRef.current.contains(event.target)) return
          setOpen(false)
        }
        var onKeyDown = function (event) {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return function () {
          document.removeEventListener('pointerdown', onPointerDown)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [open])

      /* No selection yet, or the provider has no quota adapter: no chip. */
      if (provider === undefined || data === null || data.unsupported === true) return null

      var now = Date.now()
      var name = (data.plan && data.plan.name) || SHORT_NAMES[data.provider] || data.provider
      var sessionLeft = data.session ? data.session.remainingPercent : undefined
      var weeklyLeft = data.weekly ? data.weekly.remainingPercent : undefined
      var tools = data.tools
      var balances = Array.isArray(data.balances) ? data.balances : []

      /* Chip segments: balance-type providers show the amount; window-type
       * providers show the remaining percents. */
      var chipBody = []
      if (balances.length > 0) {
        var b = balances[0]
        var bsym = b.currency === 'USD' ? '$' : '¥'
        chipBody.push(createElement('span', { key: 'bal', className: 'dpb-num' },
          bsym + (isFinite(b.total) ? b.total.toFixed(2) : '—')))
      }
      if (sessionLeft !== undefined) {
        chipBody.push(createElement('span', { key: 's', className: levelOf(sessionLeft) },
          createElement('span', { className: 'dpb-num' }, sessionLeft + '%')))
      }
      if (weeklyLeft !== undefined) {
        if (chipBody.length > 0) chipBody.push(createElement('span', { key: 'sd', className: 'dpb-sep' }, '·'))
        chipBody.push(createElement('span', { key: 'w', className: 'dpb-num' }, weeklyLeft + '%'))
      }
      if (tools !== undefined) {
        if (chipBody.length > 0) chipBody.push(createElement('span', { key: 'td', className: 'dpb-sep' }, '·'))
        chipBody.push(createElement('span', { key: 't', className: 'dpb-tools' }, String(tools.remaining)))
      }
      if (chipBody.length === 0) chipBody.push(createElement('span', { key: 'x', className: 'dpb-num' }, '!'))

      var tooltipText = balances.length > 0
        ? name + ' · 余额 ' + (balances[0].currency === 'USD' ? '$' : '¥') + (isFinite(balances[0].total) ? balances[0].total.toFixed(2) : '—')
        : name + ' · ' + t('chip.5h') + ' ' + (sessionLeft !== undefined ? sessionLeft + '%' : '—')
          + ' · ' + t('chip.week') + ' ' + (weeklyLeft !== undefined ? weeklyLeft + '%' : '—')
          + (tools !== undefined ? ' · ' + t('chip.tools') + ' ' + tools.remaining : '')

      var rows = []
      if (data.ok !== true) {
        rows.push(createElement('div', { key: 'err', className: 'dpb-error' }, errorMessage(data.error, t)))
      } else {
        balances.forEach(function (balance, index) {
          rows.push(createElement(BalanceRow, { key: 'bal' + index, balance: balance, t: t }))
        })
        rows.push(createElement(WindowRow, { key: '5h', label: t('panel.5h'), value: data.session, t: t, now: now, colorClass: 'dpb-c-blue' }))
        rows.push(createElement(WindowRow, { key: 'week', label: t('panel.week'), value: data.weekly, t: t, now: now, colorClass: 'dpb-c-green' }))
        /* Monthly window: OpenCode Go reports it; other providers omit it. */
        rows.push(createElement(WindowRow, { key: 'month', label: t('panel.month'), value: data.monthly, t: t, now: now, colorClass: 'dpb-c-purple' }))
        rows.push(createElement(ToolsRow, { key: 'tools', tools: tools, t: t }))
        if (data.stale) {
          rows.push(createElement('div', { key: 'stale', className: 'dpb-stale' }, t('panel.stale')))
        }
      }

      return createElement('span', { ref: rootRef, className: 'dpb-root' },
        createElement(Tooltip, { label: tooltipText, side: 'top', delayMs: 200, disabled: open },
          createElement('button', {
            type: 'button',
            className: 'dpb-trigger',
            'aria-label': t('chip.title'),
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            onClick: function () { setOpen(!open) },
          }, chipBody)),
        open && createElement('div', {
          className: 'dpb-panel',
          role: 'dialog',
          'aria-label': t('chip.title'),
          key: 'panel-' + tick,
        },
          createElement('div', { className: 'dpb-head' },
            createElement('span', { className: 'dpb-title' }, name),
            data.plan && data.plan.level
              ? createElement('span', { className: 'dpb-sub' }, String(data.plan.level))
              : null,
            data.plan && data.plan.renewDate
              ? createElement('span', { className: 'dpb-sub' }, '↻ ' + data.plan.renewDate)
              : null),
          createElement('button', {
            type: 'button',
            className: 'dpb-refresh',
            'aria-label': t('panel.refresh'),
            title: t('panel.refresh'),
            disabled: loading,
            onClick: function () { load(true) },
          }, loading ? '…' : '↻'),
          rows,
          data.fetchedAt
            ? createElement('div', { className: 'dpb-foot' },
                createElement('span', null, t('panel.refreshedAt') + ' ' + formatClock(data.fetchedAt)),
                createElement('span', { className: 'dpb-sub' }, SHORT_NAMES[data.provider] || data.provider))
            : null))
    }

    /* ------------------------------------------------------------------ */
    /* Cordis plugin: dictionaries + the input.right slot entry.          */
    /* ------------------------------------------------------------------ */
    module.exports = {
      name: 'dsh-provider-balance',
      inject: ['slots', 'locale'],
      apply: function apply(ctx) {
        ctx.effect(function () {
          return ctx.locale.register(NS, DICTS)
        }, 'provider-balance: dictionaries')

        /* Lazy service access handed to the slot component: the model
         * directory service may activate after this plugin loads. */
        var getModelDirectories = function () { return ctx.get('modelDirectories') }

        ctx.slots.inject('conversation.input.right', function () {
          return ctx.slots.register({
            name: 'conversation.input.right',
            id: 'provider-balance',
            order: 10,
            locale: NS,
            inject: function () { return { getModelDirectories: getModelDirectories } },
          }, ProviderBalanceChip)
        })
      },
    }

    return module.exports
  },
})
