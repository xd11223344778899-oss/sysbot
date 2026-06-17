import { registry } from '../core/command-registry.js';
import { vipCommands } from './vip.js';
import { adminCommands } from './admin.js';
import { customizationCommands } from './customization.js';
import { moderationCommands } from './moderation.js';
import { channelCommands } from './channels.js';
import { roleCommands } from './roles.js';
import { loggingCommands } from './logging.js';
import { protectionCommands } from './protection.js';
import { pointsCommands } from './points.js';
import { colorCommands } from './colors.js';
import { extraCommands } from './extras.js';
import { aliasCommands } from './aliases.js';
import { utilityCommands } from './utility.js';

export function loadCommands(): void {
  registry.registerAll([
    ...vipCommands,
    ...aliasCommands,
    ...adminCommands,
    ...customizationCommands,
    ...moderationCommands,
    ...channelCommands,
    ...roleCommands,
    ...loggingCommands,
    ...protectionCommands,
    ...pointsCommands,
    ...colorCommands,
    ...extraCommands,
    ...utilityCommands,
  ]);
}
