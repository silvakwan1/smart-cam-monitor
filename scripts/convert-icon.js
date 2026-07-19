const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(() => {
  const inputPng = path.join(__dirname, '../build/icon.png');
  const outputIco = path.join(__dirname, '../build/icon.ico');
  const outputFavicon = path.join(__dirname, '../public/favicon.ico');
  
  if (!fs.existsSync(inputPng)) {
    console.error('Erro: build/icon.png não encontrado!');
    app.quit();
    return;
  }

  // Criar diretório public se não existir
  const publicDir = path.dirname(outputFavicon);
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const img = nativeImage.createFromPath(inputPng);
  
  // 1. Gerar o ICO (256x256)
  const resized256 = img.resize({ width: 256, height: 256 });
  const pngBuffer256 = resized256.toPNG();
  
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reservado
  header.writeUInt16LE(1, 2); // Tipo (1 = Ícone)
  header.writeUInt16LE(1, 4); // Quantidade (1)
  
  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0); // Largura 256 -> 0
  entry.writeUInt8(0, 1); // Altura 256 -> 0
  entry.writeUInt8(0, 2); // Paleta -> 0
  entry.writeUInt8(0, 3); // Reservado -> 0
  entry.writeUInt16LE(1, 4); // Planos de cor -> 1
  entry.writeUInt16LE(32, 6); // Bits por pixel -> 32
  entry.writeUInt32LE(pngBuffer256.length, 8);
  entry.writeUInt32LE(22, 12); // Offset do início dos dados (6 + 16)
  
  const icoBuffer = Buffer.concat([header, entry, pngBuffer256]);
  fs.writeFileSync(outputIco, icoBuffer);
  console.log('Arquivo build/icon.ico gerado com sucesso!');
  
  // 2. Gerar o favicon (32x32)
  const resized32 = img.resize({ width: 32, height: 32 });
  const pngBuffer32 = resized32.toPNG();
  
  const headerFav = Buffer.alloc(6);
  headerFav.writeUInt16LE(0, 0);
  headerFav.writeUInt16LE(1, 2);
  headerFav.writeUInt16LE(1, 4);
  
  const entryFav = Buffer.alloc(16);
  entryFav.writeUInt8(32, 0);
  entryFav.writeUInt8(32, 1);
  entryFav.writeUInt8(0, 2);
  entryFav.writeUInt8(0, 3);
  entryFav.writeUInt16LE(1, 4);
  entryFav.writeUInt16LE(32, 6);
  entryFav.writeUInt32LE(pngBuffer32.length, 8);
  entryFav.writeUInt32LE(22, 12);
  
  const favBuffer = Buffer.concat([headerFav, entryFav, pngBuffer32]);
  fs.writeFileSync(outputFavicon, favBuffer);
  console.log('Arquivo public/favicon.ico gerado com sucesso!');

  console.log('Ícones gerados com sucesso!');
  app.quit();
});
