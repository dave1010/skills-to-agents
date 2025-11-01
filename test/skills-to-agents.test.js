const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseArgs,
  readPreamble,
  findSkills,
  extractFrontMatter,
  parseFrontMatter,
  buildSkillsBlock,
  mergeSkillsBlock,
  readSkill
} = require('../src/skills-to-agents.js');

test('parseArgs returns defaults and handles overrides', () => {
  const defaults = parseArgs([]);
  assert.equal(defaults.skillsDir, 'skills');
  assert.equal(defaults.agentsPath, 'AGENTS.md');
  assert.equal(defaults.write, false);

  const options = parseArgs([
    '--skills-dir',
    'custom-skills',
    '--agents-path',
    'docs/AGENTS.md',
    '--preamble',
    'Hello\\nWorld',
    '--write'
  ]);
  assert.equal(options.skillsDir, 'custom-skills');
  assert.equal(options.agentsPath, 'docs/AGENTS.md');
  assert.equal(options.preamble, 'Hello\nWorld');
  assert.equal(options.write, true);
});

test('parseArgs throws for missing values and conflicting preamble flags', () => {
  assert.throws(() => parseArgs(['--skills-dir']), /Missing value/);

  assert.throws(
    () =>
      parseArgs([
        '--preamble',
        'one',
        '--preamble-file',
        'two'
      ]),
    /Cannot use --preamble and --preamble-file together/
  );
});

test('readPreamble loads content from file and trims trailing newlines', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-to-agents-'));
  try {
    const filePath = path.join(tmpDir, 'preamble.txt');
    fs.writeFileSync(filePath, 'Line one\nLine two\n\n');
    const options = {
      preambleFile: filePath
    };
    const result = readPreamble(options, tmpDir);
    assert.equal(result, 'Line one\nLine two');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('findSkills returns directories and ignores files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-dir-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'alpha'));
    fs.mkdirSync(path.join(tmpDir, 'beta'));
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# ignore');

    const entries = findSkills(tmpDir);
    const names = entries.map((entry) => entry.name).sort();
    assert.deepEqual(names, ['alpha', 'beta']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('findSkills throws when directory is missing', () => {
  assert.throws(() => findSkills('/path/that/does/not/exist'));
});

test('extractFrontMatter pulls YAML block at the top of the file', () => {
  const content = ['---', 'name: Example', 'description: Something', '---', '', 'Rest'].join('\n');
  const result = extractFrontMatter(content, 'skill-path');
  assert.equal(result, 'name: Example\ndescription: Something');
});

test('parseFrontMatter supports folded descriptions and enforces required fields', () => {
  const frontMatter = [
    'name: My Skill',
    'description: >',
    '  Line one',
    '  Line two',
    '',
    'notes: ignored'
  ].join('\n');
  const parsed = parseFrontMatter(frontMatter, 'skill-path');
  assert.deepEqual(parsed, {
    name: 'My Skill',
    description: 'Line one Line two'
  });

  assert.throws(() => parseFrontMatter('name: Missing description', 'skill-path'));
});

test('buildSkillsBlock renders preamble and links', () => {
  const block = buildSkillsBlock(
    [
      {
        name: 'Alpha',
        description: 'First skill',
        link: 'skills/alpha/SKILL.md'
      }
    ],
    'Intro line'
  );

  assert.equal(
    block,
    ['<skills>', '', 'Intro line', '', '- [Alpha](skills/alpha/SKILL.md) - First skill', '</skills>', ''].join('\n')
  );
});

test('mergeSkillsBlock replaces existing blocks and appends when missing', () => {
  const freshBlock = ['<skills>', 'New', '</skills>', ''].join('\n');
  const existing = ['Header', '', '<skills>', 'Old', '</skills>', '', 'Footer'].join('\n');
  const replaced = mergeSkillsBlock(existing, freshBlock);
  assert.equal(replaced, ['Header', '', '<skills>', 'New', '</skills>', '', 'Footer'].join('\n'));

  const appended = mergeSkillsBlock('Header\n', freshBlock);
  assert.equal(appended, ['Header', '', '<skills>', 'New', '</skills>', ''].join('\n'));
});

test('readSkill loads metadata from SKILL.md and builds relative links', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-read-'));
  try {
    const skillsDir = path.join(tmpDir, 'skills');
    fs.mkdirSync(skillsDir);
    const skillFolder = path.join(skillsDir, 'alpha');
    fs.mkdirSync(skillFolder);
    const skillFile = path.join(skillFolder, 'SKILL.md');
    const content = ['---', 'name: Alpha', 'description: Literal description', '---', '', 'Body'].join('\n');
    fs.writeFileSync(skillFile, content);

    const entries = findSkills(skillsDir);
    const skill = readSkill(skillsDir, entries[0], tmpDir);
    assert.deepEqual(skill, {
      name: 'Alpha',
      description: 'Literal description',
      link: path.relative(tmpDir, skillFile).replace(/\\\\/g, '/')
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
