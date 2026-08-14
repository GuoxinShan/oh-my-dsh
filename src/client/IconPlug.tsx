import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'

/** MCP server plug glyph matching the DSH 16px outline icon style. */
export const IconPlugOutline16 = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5.5 5V1.5M10.5 5V1.5M12.5 5V8.5C12.5 10.9853 10.4853 13 8 13C5.51472 13 3.5 10.9853 3.5 8.5V5H12.5ZM8 13V15" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
