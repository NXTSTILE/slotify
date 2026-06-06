const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  for (const { from, to } of replacements) {
    if (content.includes(from)) {
      content = content.split(from).join(to);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

function traverse(dir, cb) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== '.next') {
        traverse(fullPath, cb);
      }
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      cb(fullPath);
    }
  }
}

traverse(path.join(__dirname, 'app'), (file) => {
  replaceInFile(file, [
    { from: 'FROM public.salons WHERE owner_id = $1', to: 'FROM public.salons WHERE owner_id = $1 AND is_deleted = false' },
    { from: 'FROM public.salons WHERE whatsapp_phone_number_id = $1', to: 'FROM public.salons WHERE whatsapp_phone_number_id = $1 AND is_deleted = false' },
    { from: 'FROM public.salons WHERE id = ANY($1::uuid[])', to: 'FROM public.salons WHERE id = ANY($1::uuid[]) AND is_deleted = false' },
    { from: 'FROM public.salons"', to: 'FROM public.salons WHERE is_deleted = false"' },
    
    { from: 'FROM public.appointments WHERE salon_id = $1', to: 'FROM public.appointments WHERE salon_id = $1 AND is_deleted = false' },
    { from: 'FROM public.appointments WHERE id = $1', to: 'FROM public.appointments WHERE id = $1 AND is_deleted = false' },
    { from: 'FROM public.appointments"', to: 'FROM public.appointments WHERE is_deleted = false"' },
    { from: 'FROM public.appointments a', to: 'FROM public.appointments a WHERE a.is_deleted = false' }
  ]);
});

traverse(path.join(__dirname, 'lib'), (file) => {
  replaceInFile(file, [
    { from: 'FROM public.salons WHERE id = $1', to: 'FROM public.salons WHERE id = $1 AND is_deleted = false' },
    { from: 'FROM public.appointments WHERE salon_id = $1', to: 'FROM public.appointments WHERE salon_id = $1 AND is_deleted = false' },
    { from: 'FROM public.appointments WHERE id = $1', to: 'FROM public.appointments WHERE id = $1 AND is_deleted = false' },
    { from: 'FROM public.appointments"', to: 'FROM public.appointments WHERE is_deleted = false"' }
  ]);
});
