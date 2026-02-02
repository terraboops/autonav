// Types
export type { SkillConfig, SymlinkResult } from './types.js';

// Utilities
export {
  getGlobalSkillsDir,
  getLocalSkillsDir,
  getLocalSkillPath,
  skillExists,
  localSkillExists,
  isSkillSymlink,
  getSkillSymlinkTarget,
  getSkillName,
  getUpdateSkillName,
} from './utils.js';

// Generators
export {
  generateSkillContent,
  generateUpdateSkillContent,
} from './generators.js';

// Management
export {
  createLocalSkill,
  createLocalUpdateSkill,
  symlinkSkillToGlobal,
  createAndSymlinkSkill,
  createAndSymlinkUpdateSkill,
  removeSkillSymlink,
  discoverLocalSkills,
} from './management.js';
