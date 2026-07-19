import * as path from 'path';
import * as fs from 'fs';
import { getDatasetsDir } from './database';
import { parseDatasetYaml, writeDatasetYaml } from '../utils/datasetYaml';

export async function getDatasetData() {
  const datasetsDir = getDatasetsDir();
  const yamlPath = path.join(datasetsDir, 'dataset.yaml');
  const { names } = parseDatasetYaml(yamlPath);

  const imagesTrainDir = path.join(datasetsDir, 'images', 'train');
  const labelsTrainDir = path.join(datasetsDir, 'labels', 'train');

  const images: any[] = [];
  const classCounts: Record<number, number> = {};

  for (const idStr of Object.keys(names)) {
    classCounts[parseInt(idStr, 10)] = 0;
  }

  if (fs.existsSync(imagesTrainDir)) {
    try {
      const files = await fs.promises.readdir(imagesTrainDir);
      for (const file of files) {
        const fileExt = path.extname(file).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.bmp', '.webp'].includes(fileExt)) {
          const filePath = path.join(imagesTrainDir, file);
          const stat = await fs.promises.stat(filePath);

          let classId = -1;
          let className = 'unknown';

          const capturedMatch = file.match(/^captured_([^_]+(?:_[^_]+)*)_(\d+)\.(?:jpe?g|png|webp|bmp)$/i);
          if (capturedMatch) {
            const parsedName = capturedMatch[1].toLowerCase();
            for (const [idStr, name] of Object.entries(names)) {
              if (name.toLowerCase() === parsedName) {
                classId = parseInt(idStr, 10);
                className = name;
                break;
              }
            }
          }

          if (classId === -1) {
            const labelFile = file.substring(0, file.lastIndexOf('.')) + '.txt';
            const labelPath = path.join(labelsTrainDir, labelFile);
            if (fs.existsSync(labelPath)) {
              try {
                const labelContent = await fs.promises.readFile(labelPath, 'utf-8');
                const match = labelContent.trim().match(/^(\d+)/);
                if (match) {
                  classId = parseInt(match[1], 10);
                  className = names[classId] || `class_${classId}`;
                }
              } catch (e) {
                console.error('Error resolving image class via label:', e);
              }
            }
          }

          if (classId !== -1) {
            classCounts[classId] = (classCounts[classId] || 0) + 1;
          }

          images.push({
            name: file,
            path: filePath,
            url: `media://${filePath.replace(/\\/g, '/')}`,
            size: stat.size,
            createdAt: stat.birthtimeMs || stat.mtimeMs,
            classId,
            className
          });
        }
      }
    } catch (e) {
      console.error('[Main] Failed to list train images:', e);
    }
  }

  const classesList = Object.entries(names).map(([idStr, name]) => {
    const id = parseInt(idStr, 10);
    return {
      id,
      name,
      count: classCounts[id] || 0
    };
  });

  images.sort((a, b) => b.createdAt - a.createdAt);

  return {
    classes: classesList,
    images
  };
}

export async function deleteDatasetImage(imagePath: string) {
  const filename = path.basename(imagePath);
  const datasetsDir = getDatasetsDir();

  const trainImg = path.join(datasetsDir, 'images', 'train', filename);
  const validImg = path.join(datasetsDir, 'images', 'valid', filename);

  const txtFilename = filename.substring(0, filename.lastIndexOf('.')) + '.txt';
  const trainLbl = path.join(datasetsDir, 'labels', 'train', txtFilename);
  const validLbl = path.join(datasetsDir, 'labels', 'valid', txtFilename);

  if (fs.existsSync(trainImg)) await fs.promises.unlink(trainImg);
  if (fs.existsSync(validImg)) await fs.promises.unlink(validImg);
  if (fs.existsSync(trainLbl)) await fs.promises.unlink(trainLbl);
  if (fs.existsSync(validLbl)) await fs.promises.unlink(validLbl);
}

export async function deleteDatasetClass(classId: number, className: string) {
  const datasetsDir = getDatasetsDir();
  const yamlPath = path.join(datasetsDir, 'dataset.yaml');

  const folders = [
    { img: path.join(datasetsDir, 'images', 'train'), lbl: path.join(datasetsDir, 'labels', 'train') },
    { img: path.join(datasetsDir, 'images', 'valid'), lbl: path.join(datasetsDir, 'labels', 'valid') }
  ];

  for (const folder of folders) {
    if (fs.existsSync(folder.img)) {
      const files = await fs.promises.readdir(folder.img);
      for (const file of files) {
        const fileExt = path.extname(file).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.bmp', '.webp'].includes(fileExt)) {
          let match = false;
          const capturedMatch = file.match(/^captured_([^_]+(?:_[^_]+)*)_(\d+)\./i);
          if (capturedMatch && capturedMatch[1].toLowerCase() === className.toLowerCase()) {
            match = true;
          } else {
            const labelFile = file.substring(0, file.lastIndexOf('.')) + '.txt';
            const labelPath = path.join(folder.lbl, labelFile);
            if (fs.existsSync(labelPath)) {
              try {
                const labelContent = await fs.promises.readFile(labelPath, 'utf-8');
                const classMatch = labelContent.trim().match(/^(\d+)/);
                if (classMatch && parseInt(classMatch[1], 10) === classId) {
                  match = true;
                }
              } catch (e) {
                // Ignore
              }
            }
          }

          if (match) {
            const imgPath = path.join(folder.img, file);
            const labelFile = file.substring(0, file.lastIndexOf('.')) + '.txt';
            const lblPath = path.join(folder.lbl, labelFile);

            if (fs.existsSync(imgPath)) await fs.promises.unlink(imgPath);
            if (fs.existsSync(lblPath)) await fs.promises.unlink(lblPath);
          }
        }
      }
    }
  }

  const yamlData = parseDatasetYaml(yamlPath);
  if (yamlData.names && yamlData.names[classId] !== undefined) {
    delete yamlData.names[classId];
    writeDatasetYaml(yamlPath, yamlData);
  }
}
