import { loadCommands } from '../src/modules/index.js';
import { registry } from '../src/core/command-registry.js';

const SPEC = [
  'sticker','check','checkvc','adminlist','disapplay','applay','hide','server','lock','slowmode',
  'unhide','rooms','unlock','commands','restart','setowner','setname','setnprefix','setavatar','setbanner',
  'owners','vip','allow','deny','list','settings','blackchat','logs','lremove','cmd','lsetup','setbanmsg',
  'setchannel','setpadmin','resons','pallow','plist','callow','setrole','cdeny','chide','wantilist','cunhide',
  'wanti','mypenalties','mymute','pcontinue','myprison','myvmute','penalties','records','setline','unclear',
  'unline','setclear','unreact','setpcolor','setreact','setpic','unpic','clist','dm','color','mcolors','colors',
  'createlimit','trustuser','setcolors','avatar','trustlist','change','restore','help','ping','user','ban',
  'black','banner','kick','say','block','move','moveme','addemoji','clear','procedure','unban','prison','mute',
  'unblack','unblock','unprison','unmute','unvmute','vkick','vmute','myinv','link','topinvite','info','apoint',
  'points','rpoint','setlink','preset','antijoin','setrjoin','reset','protection','antidelete','antilinks',
  'antiperms','antibots','collection','bblack','antiword','spam','role','rolemulti','myrole','dsrole','srole',
  'here','addrole','autorole','live','pic','reactrole','irole','settask','unnew','task','warn','wremove','wlist',
  'ecollection','exemption',
];

loadCommands();
const registered = new Set(registry.list().flatMap((c) => [c.name, ...(c.aliases ?? [])]));
const missing = SPEC.filter((name) => !registry.get(name));

console.log(`Registered command objects: ${registry.list().length}`);
console.log(`Total names+aliases: ${registered.size}`);
console.log(`Spec commands covered: ${SPEC.length - missing.length}/${SPEC.length}`);
if (missing.length) {
  console.log(`MISSING: ${missing.join(', ')}`);
} else {
  console.log('All spec commands are registered.');
}
process.exit(0);
