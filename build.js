#!/usr/bin/env node
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== CONFIGURACIÓN ==========
const TEAM_JSON_PATH = path.join(__dirname, 'Team.json');
const PUBLIC_DIR = __dirname; // Los HTMLs se guardan en la raíz del repo
const DOMAIN = 'https://www.revistacienciasestudiantes.com';

// ========== INICIALIZAR FIREBASE ==========
let serviceAccount;
try {
  // Intentar leer desde variable de entorno (GitHub Actions)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    // Modo desarrollo local: leer archivo
    const saPath = path.join(__dirname, 'serviceAccountKey.json');
    serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
  }
} catch (error) {
  console.error('❌ Error cargando service account:', error.message);
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ========== UTILIDADES ==========
function generateSlug(text) {
  if (!text) return '';
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Leer JSON existente (si existe)
function readExistingTeamJson() {
  try {
    if (fs.existsSync(TEAM_JSON_PATH)) {
      return JSON.parse(fs.readFileSync(TEAM_JSON_PATH, 'utf8'));
    }
  } catch (error) {
    console.warn('⚠️ No se pudo leer Team.json existente:', error.message);
  }
  return [];
}

// Guardar JSON
function saveTeamJson(users) {
  const teamJson = users.map(u => ({
    uid: u.uid,
    displayName: u.displayName,
    firstName: u.firstName,
    lastName: u.lastName,
    roles: u.roles,
    description: u.description,
    interests: u.interests,
    institution: u.institution,
    orcid: u.orcid,
    publicEmail: u.publicEmail,
    social: u.social,
    imageUrl: u.imageUrl,
    slug: u.slug
  }));
  fs.writeFileSync(TEAM_JSON_PATH, JSON.stringify(teamJson, null, 2));
}

// Crear archivo de redirección HTML
function createRedirectHtml(oldSlug, newSlug, lang = 'es') {
  const langSuffix = lang === 'en' ? '.EN' : '';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0; url=/team/${newSlug}${langSuffix}.html">
  <title>Redirigiendo...</title>
  <style>body{font-family:sans-serif;padding:2em;text-align:center;}</style>
</head>
<body>
  <p>Este perfil se ha movido. <a href="/team/${newSlug}${langSuffix}.html">Haz clic aquí si no eres redirigido</a>.</p>
</body>
</html>`;
}

// ========== ICONOS SVG ==========
const icons = {
  orcid: `<svg viewBox="0 0 256 256"><path d="M256 128c0 70.692-57.308 128-128 128S0 198.692 0 128 57.308 0 128 0s128 57.308 128 128Z" fill="#A6CE39"/><path d="M86.3 186.2H70.9V79.1h15.4v107.1zM108.9 79.1h36.6c33.6 0 43.8 24.4 43.8 53.5 0 31.1-12.3 53.6-45.1 53.6h-35.3V79.1zm15.4 92.4h15.6c23.3 0 29.8-16.1 29.8-39 0-21.3-6-38-29.3-38h-16.1v77zM78.6 73.2c-4.9 0-8.9-4-8.9-8.9 0-4.9 4-8.9 8.9-8.9s8.9 4 8.9 8.9c0 4.9-4 8.9-8.9 8.9z" fill="#fff"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`,
  web: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`
};

// ========== GENERADOR HTML ==========
function generateHTML(user, lang) {
  const isSpanish = lang === 'es';
  const roles = user.roles || [];

const isAuthorRole = r => {
  const x = r.toLowerCase().trim();
  return x === 'autor' || x === 'author';
};

const visibleRoles =
  roles.length > 1
    ? roles.filter(r => !isAuthorRole(r))
    : roles;

const rolesStr = visibleRoles.join(', ');

  const description = user.description?.[lang] || '';
  const interests = user.interests?.[lang] || [];
  const interestsHtml = interests.map(i => `<span class="keyword-tag">${i}</span>`).join('');
  
  const socialHtml = `
    <div class="profile-social">
      ${user.social?.linkedin ? `<a href="${user.social.linkedin}" target="_blank" title="LinkedIn">${icons.linkedin}</a>` : ''}
      ${user.social?.twitter || user.social?.x ? `<a href="${user.social.twitter || user.social.x}" target="_blank" title="X (Twitter)">${icons.x}</a>` : ''}
      ${user.social?.instagram ? `<a href="${user.social.instagram}" target="_blank" title="Instagram">${icons.instagram}</a>` : ''}
      ${user.social?.website ? `<a href="${user.social.website}" target="_blank" title="Sitio Web">${icons.web}</a>` : ''}
    </div>
  `;

  const orcidHtml = user.orcid ? `
    <div class="orcid-container">
      <a href="https://orcid.org/${user.orcid}" target="_blank" class="orcid-link">
        <span class="orcid-icon">${icons.orcid}</span>
        <span class="orcid-number">https://orcid.org/${user.orcid}</span>
      </a>
    </div>
  ` : '';

  // Editor en Jefe: email institucional y dirección
  const isEditorEnJefe = roles.some(r => 
    r.toLowerCase().includes('editor en jefe') || r.toLowerCase() === 'editor-in-chief'
  );
  const institutionalEmail = isEditorEnJefe
    ? `${(user.firstName || '').toLowerCase()}.${(user.lastName || '').toLowerCase()}@revistacienciasestudiantes.com`.replace(/\s/g, '')
    : '';
  const editorExtras = isEditorEnJefe ? `
    <div class="profile-inst"><a href="mailto:${institutionalEmail}">${institutionalEmail}</a></div>
    <div class="profile-inst">San Felipe, Valparaíso, Chile</div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${description.substring(0, 160)}">
  <meta name="keywords" content="${interests.join(', ')}">
  <meta name="author" content="${user.displayName}">
  <title>${user.displayName} - ${isSpanish ? 'Equipo' : 'Team'} | Revista Ciencias Estudiantes</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Lora:wght@400;700&family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #007398;
      --orcid-green: #A6CE39;
      --text: #1a1a1a;
      --grey: #555;
      --light-grey: #f8f8f8;
      --border: #e0e0e0;
    }
    body { margin: 0; font-family: 'Lora', serif; color: var(--text); background: #fff; line-height: 1.7; }
    .top-nav { padding: 20px; text-align: center; border-bottom: 1px solid var(--border); font-family: 'Inter', sans-serif; text-transform: uppercase; letter-spacing: 2px; font-size: 11px; }
    .top-nav a { text-decoration: none; color: var(--text); font-weight: 700; }
    .profile-hero { max-width: 1000px; margin: 80px auto; padding: 0 40px; display: grid; grid-template-columns: 280px 1fr; gap: 60px; align-items: start; }
    .sidebar-assets { display: flex; flex-direction: column; gap: 25px; }
    .img-container { width: 280px; }
    .profile-img { width: 100%; aspect-ratio: 1/1; object-fit: cover; filter: grayscale(10%); box-shadow: 20px 20px 0 var(--light-grey); border-radius: 4px; }
    .no-img { width: 280px; height: 280px; background: var(--light-grey); display: flex; align-items: center; justify-content: center; font-family: 'Inter', sans-serif; color: #999; }
    .profile-social { display: flex; gap: 15px; justify-content: flex-start; padding-top: 10px; }
    .profile-social a { color: var(--grey); width: 20px; height: 20px; transition: all 0.3s; opacity: 0.7; }
    .profile-social a:hover { color: var(--primary); opacity: 1; transform: translateY(-2px); }
    .profile-info h1 { font-family: 'Playfair Display', serif; font-size: 3.8rem; margin: 0 0 10px; line-height: 1.1; font-weight: 900; letter-spacing: -1px; }
    .profile-role { font-family: 'Inter', sans-serif; color: var(--primary); text-transform: uppercase; letter-spacing: 4px; font-size: 13px; font-weight: 700; margin-bottom: 20px; display: block; }
    .profile-inst { font-family: 'Inter', sans-serif; color: var(--grey); font-size: 14px; margin-top: 5px; }
    .orcid-container { margin: 20px 0; }
    .orcid-link { display: inline-flex; align-items: center; text-decoration: none; color: var(--grey); font-family: 'Inter', sans-serif; font-size: 13px; padding: 6px 12px 6px 8px; background: var(--light-grey); border-radius: 4px; transition: background 0.3s; }
    .orcid-link:hover { background: #eee; }
    .orcid-icon { width: 20px; height: 20px; margin-right: 10px; }
    .container { max-width: 800px; margin: 0 auto 100px; padding: 0 40px; }
    .section-title { font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 3px; border-bottom: 2px solid var(--text); padding-bottom: 8px; margin: 60px 0 30px; }
    .bio-text { font-size: 1.2rem; color: #333; text-align: justify; }
    .tags-container { display: flex; flex-wrap: wrap; gap: 10px; }
    .keyword-tag { font-family: 'Inter', sans-serif; font-size: 12px; background: var(--light-grey); padding: 6px 15px; border-radius: 20px; font-weight: 600; }
    .footer-nav { text-align: center; padding: 60px 20px; background: var(--light-grey); margin-top: 100px; }
    .footer-nav a { font-family: 'Inter', sans-serif; font-size: 12px; text-decoration: none; color: var(--primary); font-weight: 700; margin: 0 15px; text-transform: uppercase; }
    @media (max-width: 850px) {
      .profile-hero { grid-template-columns: 1fr; text-align: center; gap: 40px; }
      .sidebar-assets { align-items: center; }
      .profile-social { justify-content: center; }
      .orcid-link { justify-content: center; }
      .profile-info h1 { font-size: 2.8rem; }
    }
  </style>
</head>
<body>
  <nav class="top-nav"><a href="/">${isSpanish ? 'Revista Nacional de las Ciencias para Estudiantes' : 'The National Review of Sciences for Students'}</a></nav>
  <header class="profile-hero">
    <div class="sidebar-assets">
      <div class="img-container">
        ${user.imageUrl ? `<img src="${user.imageUrl}" alt="${user.displayName}" class="profile-img">` : '<div class="no-img">Sin imagen</div>'}
      </div>
      ${socialHtml}
    </div>
    <div class="profile-info">
      <span class="profile-role">${rolesStr}</span>
      <h1>${user.displayName}</h1>
      <div class="profile-inst">${user.institution || ''}</div>
      ${orcidHtml}
      ${editorExtras}
    </div>
  </header>
  <main class="container">
    <section>
      <h2 class="section-title">${isSpanish ? 'Sobre mí' : 'About'}</h2>
      <div class="bio-text">${description}</div>
    </section>
    <section>
      <h2 class="section-title">${isSpanish ? 'Áreas de interés' : 'Areas of interest'}</h2>
      <div class="tags-container">${interestsHtml}</div>
    </section>
  </main>
  <footer class="footer-nav">
    <a href="/team/">← ${isSpanish ? 'Volver al Equipo' : 'Back to Team'}</a>
    <a href="/">${isSpanish ? 'Inicio' : 'Home'}</a>
  </footer>
</body>
</html>`;
}

// ========== FUNCIONES PRINCIPALES ==========
async function fetchAllUsers() {
  const snapshot = await db.collection('users').get();
  const users = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    users.push({
      uid: doc.id,
      displayName: data.displayName || '',
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      roles: data.roles || [],
      description: data.description || { es: '', en: '' },
      interests: data.interests || { es: [], en: [] },
      institution: data.institution || '',
      orcid: data.orcid || '',
      publicEmail: data.publicEmail || '',
      social: data.social || {},
      imageUrl: data.imageUrl || ''
    });
  });
  return users;
}

async function fetchUser(uid) {
  const doc = await db.collection('users').doc(uid).get();
  if (!doc.exists) return null;
  const data = doc.data();
  return {
    uid: doc.id,
    displayName: data.displayName || '',
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    roles: data.roles || [],
    description: data.description || { es: '', en: '' },
    interests: data.interests || { es: [], en: [] },
    institution: data.institution || '',
    orcid: data.orcid || '',
    publicEmail: data.publicEmail || '',
    social: data.social || {},
    imageUrl: data.imageUrl || ''
  };
}

// Asignar slugs respetando los existentes para evitar cambios innecesarios
function assignSlugsPreserving(users, existingUsers) {
  const existingMap = new Map(existingUsers.map(u => [u.uid, u]));
  const usedSlugs = new Map(existingUsers.map(u => [u.slug, u.uid]));
  
  return users.map(user => {
    // Si el usuario ya existía, mantener su slug si es posible
    const existing = existingMap.get(user.uid);
    const base = generateSlug(user.displayName || `${user.firstName} ${user.lastName}`);
    
    if (existing && existing.slug === base) {
      // Mismo slug, perfecto
      return { ...user, slug: existing.slug };
    }
    
    // Slug cambió o usuario nuevo
    let slug = base;
    let count = 1;
    
    // Si el slug base ya está usado por OTRO usuario, añadir número
    while (usedSlugs.has(slug) && usedSlugs.get(slug) !== user.uid) {
      slug = `${base}${count}`;
      count++;
    }
    
    // Actualizar mapa de slugs usados
    if (existing && existing.slug !== slug) {
      usedSlugs.delete(existing.slug); // liberar slug antiguo
    }
    usedSlugs.set(slug, user.uid);
    
    return { ...user, slug };
  });
}

// Generar redirecciones si un slug cambió
function generateRedirects(oldUsers, newUsers) {
  const oldMap = new Map(oldUsers.map(u => [u.uid, u]));
  
  for (const newUser of newUsers) {
    const oldUser = oldMap.get(newUser.uid);
    if (oldUser && oldUser.slug !== newUser.slug) {
      console.log(`🔄 Slug cambiado: ${oldUser.slug} → ${newUser.slug}`);
      
      // Crear redirecciones para ambos idiomas
      const redirectEs = createRedirectHtml(oldUser.slug, newUser.slug, 'es');
      const redirectEn = createRedirectHtml(oldUser.slug, newUser.slug, 'en');
      
      fs.writeFileSync(path.join(PUBLIC_DIR, `${oldUser.slug}.html`), redirectEs);
      fs.writeFileSync(path.join(PUBLIC_DIR, `${oldUser.slug}.EN.html`), redirectEn);
    }
  }
}

// Generar HTMLs para una lista de usuarios
function generateHtmls(users) {
  for (const user of users) {
    const htmlEs = generateHTML(user, 'es');
    const htmlEn = generateHTML(user, 'en');
    fs.writeFileSync(path.join(PUBLIC_DIR, `${user.slug}.html`), htmlEs);
    fs.writeFileSync(path.join(PUBLIC_DIR, `${user.slug}.EN.html`), htmlEn);
    console.log(`✅ Generado: ${user.slug}.html`);
  }
}

// ========== MODO DE EJECUCIÓN ==========
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'full';
  
  console.log('🚀 Iniciando build en modo:', mode);
  
  const existingUsers = readExistingTeamJson();
  
  if (mode === 'full' || mode === '--full') {
    // Reconstrucción completa
    console.log('📥 Obteniendo todos los usuarios de Firebase...');
    const freshUsers = await fetchAllUsers();
    const usersWithSlug = assignSlugsPreserving(freshUsers, existingUsers);
    
    // Generar redirecciones para slugs que cambiaron
    generateRedirects(existingUsers, usersWithSlug);
    
    // Guardar JSON
    saveTeamJson(usersWithSlug);
    
    // Generar HTMLs
    generateHtmls(usersWithSlug);
    
    console.log(`🎉 Build completo finalizado. Total: ${usersWithSlug.length} usuarios.`);
    
  } else if (mode === '--user') {
    // Actualizar un solo usuario
    const uid = args[1];
    if (!uid) {
      console.error('❌ Falta UID. Uso: build.js --user <uid>');
      process.exit(1);
    }
    
    console.log(`📥 Obteniendo usuario ${uid}...`);
    const user = await fetchUser(uid);
    if (!user) {
      console.error(`❌ Usuario ${uid} no encontrado`);
      process.exit(1);
    }
    
    // Mezclar con usuarios existentes
    const otherUsers = existingUsers.filter(u => u.uid !== uid);
    const allUsers = [...otherUsers, user];
    
    // Reasignar slugs (puede afectar a otros si hay duplicados)
    const usersWithSlug = assignSlugsPreserving(allUsers, existingUsers);
    
    // Encontrar el usuario actualizado para ver si cambió slug
    const updatedUser = usersWithSlug.find(u => u.uid === uid);
    const oldUser = existingUsers.find(u => u.uid === uid);
    
    if (oldUser && oldUser.slug !== updatedUser.slug) {
      // Crear redirección desde slug antiguo
      console.log(`🔄 Slug cambiado: ${oldUser.slug} → ${updatedUser.slug}`);
      const redirectEs = createRedirectHtml(oldUser.slug, updatedUser.slug, 'es');
      const redirectEn = createRedirectHtml(oldUser.slug, updatedUser.slug, 'en');
      fs.writeFileSync(path.join(PUBLIC_DIR, `${oldUser.slug}.html`), redirectEs);
      fs.writeFileSync(path.join(PUBLIC_DIR, `${oldUser.slug}.EN.html`), redirectEn);
    }
    
    // Guardar JSON
    saveTeamJson(usersWithSlug);
    
    // Regenerar HTML del usuario actualizado (y opcionalmente de otros si sus slugs cambiaron)
    // Por simplicidad, regeneramos solo el usuario actualizado. Si otro usuario tuvo que cambiar slug
    // por duplicado con el nuevo, también habría que regenerarlo. Para mantenerlo simple, en modo --user
    // solo regeneramos el usuario objetivo y confiamos en que los slugs de otros no cambian.
    generateHtmls([updatedUser]);
    
    console.log(`✅ Usuario ${uid} actualizado.`);
    
  } else {
    console.error('❌ Modo no reconocido. Usa: build.js [--full|--user <uid>]');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Error en build:', error);
  process.exit(1);
});