import { protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { Readable } from 'stream';

export function registerMediaProtocol() {
  protocol.handle('media', (request) => {
    let rawPath = request.url.replace(/^media:\/\/+/i, '');
    let decodedPath = decodeURIComponent(rawPath);
    
    // Normalise Windows drive letter prefix (e.g., "c/" -> "c:/" or "/c/" -> "c:/")
    if (decodedPath.startsWith('/')) {
      decodedPath = decodedPath.substring(1);
    }
    
    if (/^[a-zA-Z]\//.test(decodedPath)) {
      decodedPath = decodedPath[0] + ':' + decodedPath.substring(1);
    } else if (/^[a-zA-Z]:/.test(decodedPath)) {
      if (decodedPath[2] !== '/') {
        decodedPath = decodedPath.substring(0, 2) + '/' + decodedPath.substring(2);
      }
    }
    
    const normalizedPath = path.normalize(decodedPath);
    
    if (!fs.existsSync(normalizedPath)) {
      return new Response('File not found', { status: 404 });
    }
    
    try {
      const stats = fs.statSync(normalizedPath);
      const fileSize = stats.size;
      const range = request.headers.get('range');
      
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        
        if (start >= fileSize || end >= fileSize) {
          return new Response('Requested range not satisfiable', {
            status: 416,
            headers: {
              'Content-Range': `bytes */${fileSize}`,
              'Accept-Ranges': 'bytes'
            }
          });
        }
        
        const chunksize = (end - start) + 1;
        const fileStream = fs.createReadStream(normalizedPath, { start, end });
        const webStream = Readable.toWeb(fileStream);
        
        return new Response(webStream as any, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Type': 'video/mp4'
          }
        });
      } else {
        const fileStream = fs.createReadStream(normalizedPath);
        const webStream = Readable.toWeb(fileStream);
        
        return new Response(webStream as any, {
          status: 200,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': fileSize.toString(),
            'Content-Type': 'video/mp4'
          }
        });
      }
    } catch (err: any) {
      console.error('[Protocol Handler] Error reading file:', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  });
}
