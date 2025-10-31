#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_PREAMBLE = [
  '## Skills',
  '',
  'You have new skills. If any skill might be relevant then you MUST read it.'
].join('\n');

function printHelp() {
  console.log(
    'Usage: skills-to-agents-md [options]\n\n' +
    'Options:\n' +
    '  --skills-dir <path>     Path to the skills directory (default: ./skills)\n' +
    '  --agents-path <path>    Path to the AGENTS.md file (default: ./AGENTS.md)\n' +
    '  --preamble <text>       Override preamble text (use \\n for new lines)\n' +
    '  --preamble-file <path>  Read preamble text from a file\n' +
    '  --write                 Write changes to disk (dry run otherwise)\n' +
    '  -h, --help              Show this help message\n'
  );
}

function parseArgs(argv) {
  const options = {
    skillsDir: 'skills',
    agentsPath: 'AGENTS.md',
    preamble: DEFAULT_PREAMBLE,
    write: false,
    preambleInlineSet: false,
    preambleFileSet: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--write') {
      options.write = true;
      continue;
    }

    const requiresValue = new Map([
      ['--skills-dir', (value) => { options.skillsDir = value; }],
      ['--agents-path', (value) => { options.agentsPath = value; }],
      ['--preamble', (value) => {
        options.preamble = value.replace(/\\n/g, '\n');
        options.preambleInlineSet = true;
      }],
      ['--preamble-file', (value) => {
        options.preambleFile = value;
        options.preambleFileSet = true;
      }]
    ]);

    if (requiresValue.has(arg)) {
      i += 1;
      if (i >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      requiresValue.get(arg)(argv[i]);
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.preambleInlineSet && options.preambleFileSet) {
    throw new Error('Cannot use --preamble and --preamble-file together.');
  }

  return options;
}

function readPreamble(options, cwd) {
  if (options.preambleFile) {
    const resolved = path.resolve(cwd, options.preambleFile);
    return fs.readFileSync(resolved, 'utf8').trimEnd();
  }
  return options.preamble;
}

function findSkills(skillsDir) {
  if (!fs.existsSync(skillsDir)) {
    throw new Error(`Skills directory not found at ${skillsDir}`);
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory());
}

function extractFrontMatter(content, skillPath) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*/);
  if (!match) {
    throw new Error(`No front matter found in ${skillPath}`);
  }
  return match[1];
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    const quote = value[0];
    const inner = value.slice(1, -1);
    if (quote === '"') {
      return inner.replace(/\\([\\"n])/g, (match, ch) => {
        if (ch === 'n') {
          return '\n';
        }
        return ch;
      });
    }
    return inner.replace(/\\([\\'])/g, (match, ch) => ch);
  }
  return value;
}

function parseFrontMatter(frontMatter, skillPath) {
  const lines = frontMatter.split(/\r?\n/);
  const data = {};

  let currentKey = null;
  let currentLines = [];
  let blockStyle = null; // 'literal' or 'folded'
  let chomp = 'clip';

  const finalize = () => {
    if (!currentKey) {
      return;
    }
    let finalValue;
    if (blockStyle) {
      const raw = currentLines.join('\n');
      if (blockStyle === 'literal') {
        finalValue = raw;
      } else {
        finalValue = raw
          .split(/\n{2,}/)
          .map((paragraph) => paragraph.replace(/\n/g, ' '))
          .join('\n\n');
      }
      if (chomp === 'strip') {
        finalValue = finalValue.replace(/\n+$/, '');
      } else if (chomp === 'clip') {
        finalValue = finalValue.replace(/\n$/, '');
      }
    } else {
      finalValue = currentLines.length ? currentLines.join(' ') : '';
    }
    data[currentKey] = blockStyle ? finalValue.trimEnd() : finalValue.trim();
    currentKey = null;
    currentLines = [];
    blockStyle = null;
    chomp = 'clip';
  };

  for (const line of lines) {
    if (currentKey && (line.startsWith(' ') || line.startsWith('\t'))) {
      currentLines.push(line.replace(/^[ \t]*/, ''));
      continue;
    }

    if (currentKey) {
      finalize();
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    currentKey = line.slice(0, colonIndex).trim();
    let valuePart = line.slice(colonIndex + 1).trim();

    if (!valuePart) {
      currentLines = [''];
      continue;
    }

    const blockMatch = valuePart.match(/^([>|])([+-])?$/);
    if (blockMatch) {
      blockStyle = blockMatch[1] === '|' ? 'literal' : 'folded';
      chomp = blockMatch[2] === '-' ? 'strip' : blockMatch[2] === '+' ? 'keep' : 'clip';
      currentLines = [];
      continue;
    }

    valuePart = unquote(valuePart);
    currentLines = [valuePart];
  }

  finalize();

  if (!data.name || !data.description) {
    throw new Error(`Front matter in ${skillPath} must include name and description.`);
  }

  return {
    name: data.name,
    description: data.description
  };
}

function readSkill(skillsDir, entry, rootDir) {
  const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    throw new Error(`Missing SKILL.md for skill directory: ${entry.name}`);
  }

  const content = fs.readFileSync(skillPath, 'utf8');
  const frontMatter = extractFrontMatter(content, skillPath);
  const data = parseFrontMatter(frontMatter, skillPath);
  const relativeLink = path.relative(rootDir, skillPath).replace(/\\/g, '/');
  return {
    name: data.name,
    description: data.description,
    link: relativeLink
  };
}

function buildSkillsBlock(skills, preamble) {
  const preambleLines = preamble
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  const lines = ['<skills>'];

  if (preambleLines.length > 0 && preambleLines.some((line) => line.length > 0)) {
    lines.push('');
    lines.push(...preambleLines);
  }

  if (skills.length > 0) {
    lines.push('');
    lines.push(...skills.map((skill) => `- [${skill.name}](${skill.link}) - ${skill.description}`));
  }

  lines.push('</skills>');
  return `${lines.join('\n')}\n`;
}

function mergeSkillsBlock(originalContent, skillsBlock) {
  const skillsTagRegex = /<skills>[\s\S]*?<\/skills>/m;
  if (skillsTagRegex.test(originalContent)) {
    return originalContent.replace(skillsTagRegex, skillsBlock.trimEnd());
  }

  const trimmed = originalContent.replace(/\s*$/, '\n');
  return `${trimmed}\n${skillsBlock}`.replace(/^\n+/, '');
}

function writeFileAtomic(filePath, content) {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `${path.basename(filePath)}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  fs.writeFileSync(tempPath, content, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error('');
    printHelp();
    process.exit(1);
  }

  if (options.help) {
    printHelp();
    return;
  }

  const cwd = process.cwd();
  const skillsDir = path.resolve(cwd, options.skillsDir);
  const agentsPath = path.resolve(cwd, options.agentsPath);
  const rootDir = cwd;

  let preamble;
  try {
    preamble = readPreamble(options, cwd);
  } catch (error) {
    console.error(`Failed to read preamble: ${error.message}`);
    process.exit(1);
  }

  let skillEntries;
  try {
    skillEntries = findSkills(skillsDir);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const skills = [];
  for (const entry of skillEntries) {
    try {
      skills.push(readSkill(skillsDir, entry, rootDir));
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));

  const skillsBlock = buildSkillsBlock(skills, preamble);

  if (!fs.existsSync(agentsPath)) {
    console.error(`AGENTS.md not found at ${agentsPath}`);
    process.exit(1);
  }

  const originalContent = fs.readFileSync(agentsPath, 'utf8');
  const mergedContent = mergeSkillsBlock(originalContent, skillsBlock);
  const normalizedMerged = mergedContent.replace(/\s*$/, '\n');
  const normalizedOriginal = originalContent.replace(/\s*$/, '\n');

  if (normalizedMerged === normalizedOriginal) {
    console.log('AGENTS.md is already up to date.');
    return;
  }

  console.log('AGENTS.md requires updates.');
  if (!options.write) {
    console.log('Run with --write to apply changes.');
    return;
  }

  writeFileAtomic(agentsPath, normalizedMerged);
  console.log('AGENTS.md updated.');
}

main();
