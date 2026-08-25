export const PRODUCT_NAME = 'Oh My DSH'
export const APP_ID = 'dev.dsh.desktop'
export const SHELL_NAME = 'dsh-desktop'

export const BRIDGE_PACKAGE = 'dsh-desktop-bridge'
export const COMPACTION_PACKAGE = 'dsh-compaction-hierarchical'
export const WEB_SEARCH_TOGGLE_PACKAGE = 'dsh-web-search-toggle'
export const MODEL_IMAGE_INPUT_PACKAGE = 'dsh-model-image-input'
export const SEND_WHILE_RUNNING_PACKAGE = 'dsh-send-while-running'

export const COMPACTION_RUNTIME_PEERS = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-compaction-basic',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-token-meter',
  '@deepseek-ai/schemastery',
] as const

export const WEB_SEARCH_TOGGLE_RUNTIME_PEERS = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-credentials',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-system-prompt',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-typert-protocol',
  '@deepseek-ai/dsh-typert-registry',
] as const

export const MISSING_RESTORE_SOURCE = '[missing-web-profile]'

export const PROBE_INTERVAL_MS = 500
export const PROBE_BUDGET_MS = 120_000
export const TERM_GRACE_MS = 3_000
export const LADDER_TICK_MS = 100
