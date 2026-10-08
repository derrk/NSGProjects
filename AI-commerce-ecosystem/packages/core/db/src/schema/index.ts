/**
 * Single entry point for the whole schema.
 *
 * drizzle.config.ts points at THIS file rather than a `src/schema/*.ts` glob: a glob
 * that picks a table up twice only produces a soft warning and then emits a corrupt
 * migration, which is a bad failure mode for something that runs unattended.
 */
export * from './enums'
export * from './shops'
export * from './catalog'
export * from './commerce'
export * from './ops'
export * from './relations'
