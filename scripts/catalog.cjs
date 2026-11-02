// Read the site's authored course data, without loading project applications or upstream tools.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const sets = {
  naplespu: ['hardware.js', 'software.js', 'deep-core.js', 'deep-noc.js', 'deep-memory.js'],
  opentpu: ['hardware.js', 'software.js', 'microarch.js'],
  gemmini: ['hardware.js', 'software.js', 'concepts.js'],
};
const result = {};
for (const [name, files] of Object.entries(sets)) {
  const folder = path.join(root, 'projects', name, 'content');
  if (!fs.existsSync(folder)) continue;
  const context = vm.createContext({ window: {} }, { codeGeneration: { strings: false, wasm: false } });
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(folder, file), 'utf8'), context, { timeout: 2000, filename: file });
  const chapters = Object.values(context.window).flatMap(value => value?.chapters || []);
  result[name] = chapters.map(chapter => ({
    id: (name === 'opentpu' ? 'ch-' : '') + chapter.id,
    title: chapter.title.replace(/^\d+\s*[·.、]\s*/, ''),
  }));
}
const coral = path.join(root, 'projects/coral-npu/content');
if (fs.existsSync(coral)) result['coral-npu'] = ['hardware.json', 'software.json'].flatMap(file =>
  JSON.parse(fs.readFileSync(path.join(coral, file), 'utf8')).chapters.map(chapter => ({
    id: 'chapter-' + chapter.id, title: chapter.title.replace(/^\d+\s*[·.、]\s*/, ''),
  })));
process.stdout.write(JSON.stringify(result));
