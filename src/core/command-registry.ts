import type { Command, CommandCategory } from '../types/command.js';
import { logger } from '../logger.js';

class CommandRegistry {
  private readonly byName = new Map<string, Command>();
  private readonly all: Command[] = [];

  register(command: Command): void {
    const names = [command.name, ...(command.aliases ?? [])];
    for (const name of names) {
      const key = name.toLowerCase();
      if (this.byName.has(key)) {
        logger.warn({ command: command.name, conflict: key }, 'Duplicate command name ignored');
        continue;
      }
      this.byName.set(key, command);
    }
    this.all.push(command);
  }

  registerAll(commands: Command[]): void {
    for (const command of commands) this.register(command);
  }

  get(name: string): Command | undefined {
    return this.byName.get(name.toLowerCase());
  }

  list(): Command[] {
    return [...this.all];
  }

  byCategory(): Map<CommandCategory, Command[]> {
    const grouped = new Map<CommandCategory, Command[]>();
    for (const command of this.all) {
      const bucket = grouped.get(command.category) ?? [];
      bucket.push(command);
      grouped.set(command.category, bucket);
    }
    return grouped;
  }
}

export const registry = new CommandRegistry();
