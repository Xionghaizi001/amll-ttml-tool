import { ExtensionRegistry } from "$/kernel/extensions";
import { commandRegistry } from "$/modules/keyboard/registry";

/** Shared host registries. Plugin activation receives a scoped facade from here. */
export const extensionRegistry = new ExtensionRegistry(commandRegistry);
