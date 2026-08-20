/** CSS Modules shim: the tsdown client build inlines .module.css imports as a
 * class-name map (see tsdown.config.ts), so the type is a plain record. */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
