import * as fs from 'fs';

export function parseDatasetYaml(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return { names: {} as Record<number, string>, path: '', train: '', val: '' };
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const names: Record<number, string> = {};
  let pathVal = '';
  let trainVal = '';
  let valVal = '';

  let inNamesSection = false;
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('names:')) {
      inNamesSection = true;
      continue;
    }

    if (inNamesSection) {
      const matchProperty = trimmed.match(/^([a-zA-Z_]+)\s*:/);
      if (matchProperty && matchProperty[1] !== 'names') {
        inNamesSection = false;
      }
    }

    if (inNamesSection) {
      const match = trimmed.match(/^['"]?(\d+)['"]?\s*:\s*['"]?([^'"]+)['"]?/);
      if (match) {
        names[parseInt(match[1], 10)] = match[2].trim();
      }
    } else {
      const match = trimmed.match(/^([a-zA-Z_]+)\s*:\s*['"]?([^'"]+)['"]?/);
      if (match) {
        const key = match[1];
        const val = match[2].trim();
        if (key === 'path') pathVal = val;
        else if (key === 'train') trainVal = val;
        else if (key === 'val') valVal = val;
      }
    }
  }
  return { names, path: pathVal, train: trainVal, val: valVal };
}

export function writeDatasetYaml(
  filePath: string,
  data: { names: Record<number, string>; path: string; train: string; val: string }
) {
  let content = 'names:\n';
  const keys = Object.keys(data.names).map(Number).sort((a, b) => a - b);
  for (const k of keys) {
    content += `  ${k}: ${data.names[k]}\n`;
  }
  content += `path: ${data.path.replace(/\\/g, '/')}\n`;
  content += `train: ${data.train}\n`;
  content += `val: ${data.val}\n`;
  fs.writeFileSync(filePath, content, 'utf-8');
}
