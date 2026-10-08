/**
 * The core schema: thirteen tables that know nothing about mugs, filament or cards.
 *
 * drizzle.config.ts points at THIS file rather than a glob, so a table can never be
 * collected twice (which drizzle-kit reports as a warning and then emits a corrupt
 * migration from).
 *
 * Module tables live in their own Postgres schema (`pod.*`) and reference core rows by
 * id. Core never references a module table — that one rule is what keeps a division
 * removable.
 */
export * from './enums'
export * from './registry'
export * from './work'
export * from './governance'
export * from './knowledge'
export * from './relations'
