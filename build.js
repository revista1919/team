#!/usr/bin/env node
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== CONFIGURACIÓN ==========
const TEAM_JSON_PATH = path.join(__dirname, 'Team.json');
const PUBLIC_DIR = __dirname;
const DOMAIN = 'https://www.revistacienciasestudiantes.com';
const ARTICLES_JSON_URL = 'https://www.revistacienciasestudiantes.com/articles.json';

// ========== INICIALIZAR FIREBASE ==========
let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
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

// Generar ID único para autores sin cuenta
function generateAnonymousId(name) {
  const hash = crypto.createHash('sha256')
    .update(name + '-' + Date.now().toString())
    .digest('hex')
    .substring(0, 12);
  return `anon-${hash}`;
}

// Leer JSON existente
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
    roles: (u.roles || []).filter(r => {
      const role = r.toLowerCase().trim();
      return role !== 'revisor' && role !== 'reviewer';
    }),
    description: u.description,
    interests: u.interests,
    institution: u.institution,
    orcid: u.orcid,
    publicEmail: u.publicEmail || null,
    social: u.social,
    imageUrl: u.imageUrl,
    slug: u.slug,
    isAnonymous: u.isAnonymous || false,
    claimHash: u.claimHash || null,
    articles: u.articles || [] // Guardamos los artículos
  }));
  
  // Debug: mostrar cuántos artículos tiene cada usuario
  const usersWithArticles = teamJson.filter(u => u.articles && u.articles.length > 0);
  console.log(`💾 Guardando Team.json con ${teamJson.length} usuarios (${usersWithArticles.length} con artículos)`);
  
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
  web: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  article: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h6M8 16h4"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  volume: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`
};

// ========== MATCHING DE AUTORES CON ARTÍCULOS ==========
function matchAuthorsWithArticles(users, articles) {
  console.log('🔗 Matcheando autores con sus artículos...');
  console.log(`   Usuarios: ${users.length}, Artículos: ${articles.length}`);
  
  // Crear mapa de artículos por autor
  const authorArticlesMap = new Map();
  
  // Crear mapas de usuarios por diferentes criterios
  const userByUid = new Map();
  const userBySlug = new Map();
  const userByDisplayName = new Map();
  const userByFullName = new Map();
  const userByEmail = new Map();
  const userByOrcid = new Map();
  
  users.forEach(user => {
    // Por UID
    if (user.uid) {
      userByUid.set(user.uid, user);
      userByUid.set(user.uid.toLowerCase(), user);
      userByUid.set(user.uid.trim(), user);
    }
    
    // Por slug
    if (user.slug) {
      userBySlug.set(user.slug, user);
      userBySlug.set(user.slug.toLowerCase(), user);
      userBySlug.set(user.slug.trim(), user);
    }
    
    // Por displayName
    if (user.displayName) {
      userByDisplayName.set(user.displayName, user);
      userByDisplayName.set(user.displayName.toLowerCase(), user);
      userByDisplayName.set(user.displayName.trim(), user);
      // Versión sin números
      userByDisplayName.set(user.displayName.replace(/\d+$/, '').trim(), user);
      userByDisplayName.set(user.displayName.toLowerCase().replace(/\d+$/, '').trim(), user);
    }
    
    // Por nombre completo (firstName + lastName)
    if (user.firstName || user.lastName) {
      const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
      if (fullName) {
        userByFullName.set(fullName, user);
        userByFullName.set(fullName.toLowerCase(), user);
        // Versión sin números
        userByFullName.set(fullName.replace(/\d+$/, '').trim(), user);
        userByFullName.set(fullName.toLowerCase().replace(/\d+$/, '').trim(), user);
      }
    }
    
    // Por email
    if (user.publicEmail) {
      userByEmail.set(user.publicEmail.toLowerCase().trim(), user);
    }
    
    // Por ORCID
    if (user.orcid) {
      const cleanOrcid = user.orcid.replace('https://orcid.org/', '').trim();
      userByOrcid.set(cleanOrcid, user);
    }
  });
  
  // Contador para estadísticas
  let matchedCount = 0;
  let unmatchedCount = 0;
  
  articles.forEach(article => {
    if (!article.autores) return;
    
    // Normalizar autores a array
    let autoresArray = [];
    if (typeof article.autores === 'string') {
      autoresArray = article.autores.split(';').map(name => ({ name: name.trim() }));
    } else if (Array.isArray(article.autores)) {
      autoresArray = article.autores.map(a => {
        if (typeof a === 'string') return { name: a };
        return a;
      });
    }
    
    // Obtener authorIds si existen
    const authorIds = article.authorIds || [];
    
    // GENERAR SLUG DEL ARTÍCULO USANDO PERMALINK SI EXISTE
    let articleSlug = '';
    
    if (article.permalink && article.permalink.trim() !== '') {
      // Usar el permalink directamente
      articleSlug = article.permalink;
      console.log(`   🔗 Usando permalink: ${articleSlug}`);
    } else {
      // Generar slug como fallback
      articleSlug = generateSlug(article.titulo || '') + '-' + (article.numeroArticulo || '');
      console.log(`   ⚠️ Permalink no encontrado, generando slug: ${articleSlug}`);
    }
    
    // Procesar cada autor
    autoresArray.forEach((author, index) => {
      const authorName = author.name || `${author.firstName || ''} ${author.lastName || ''}`.trim();
      const authorEmail = author.email || author.publicEmail || '';
      const authorOrcid = author.orcid || '';
      const authorSlug = author.slug || '';
      const authorId = author.authorId || authorIds[index] || null;
      
      console.log(`\n   👤 Procesando autor: "${authorName}"`);
      console.log(`      AuthorID: ${authorId || 'null'}`);
      console.log(`      Email: ${authorEmail || 'null'}`);
      console.log(`      ORCID: ${authorOrcid || 'null'}`);
      console.log(`      Slug: ${authorSlug || 'null'}`);
      
      let matchedUser = null;
      let matchMethod = '';
      
      // 1. Intentar por authorId (UID)
      if (authorId) {
        if (userByUid.has(authorId)) {
          matchedUser = userByUid.get(authorId);
          matchMethod = 'UID';
        } else if (userByUid.has(authorId.toLowerCase())) {
          matchedUser = userByUid.get(authorId.toLowerCase());
          matchMethod = 'UID (lowercase)';
        } else if (userByUid.has(authorId.trim())) {
          matchedUser = userByUid.get(authorId.trim());
          matchMethod = 'UID (trim)';
        } else {
          // Buscar coincidencia parcial de UID
          for (const [uid, user] of userByUid) {
            if (uid.includes(authorId) || authorId.includes(uid)) {
              matchedUser = user;
              matchMethod = 'UID (parcial)';
              break;
            }
          }
        }
      }
      
      // 2. Intentar por email
      if (!matchedUser && authorEmail) {
        const cleanEmail = authorEmail.toLowerCase().trim();
        if (userByEmail.has(cleanEmail)) {
          matchedUser = userByEmail.get(cleanEmail);
          matchMethod = 'Email';
        }
      }
      
      // 3. Intentar por ORCID
      if (!matchedUser && authorOrcid) {
        const cleanOrcid = authorOrcid.replace('https://orcid.org/', '').trim();
        if (userByOrcid.has(cleanOrcid)) {
          matchedUser = userByOrcid.get(cleanOrcid);
          matchMethod = 'ORCID';
        }
      }
      
      // 4. Intentar por slug
      if (!matchedUser && authorSlug) {
        if (userBySlug.has(authorSlug)) {
          matchedUser = userBySlug.get(authorSlug);
          matchMethod = 'Slug';
        } else if (userBySlug.has(authorSlug.toLowerCase())) {
          matchedUser = userBySlug.get(authorSlug.toLowerCase());
          matchMethod = 'Slug (lowercase)';
        }
      }
      
      // 5. Intentar por nombre exacto
      if (!matchedUser && authorName) {
        const cleanName = authorName.trim();
        if (userByDisplayName.has(cleanName)) {
          matchedUser = userByDisplayName.get(cleanName);
          matchMethod = 'DisplayName';
        } else if (userByDisplayName.has(cleanName.toLowerCase())) {
          matchedUser = userByDisplayName.get(cleanName.toLowerCase());
          matchMethod = 'DisplayName (lowercase)';
        } else if (userByFullName.has(cleanName)) {
          matchedUser = userByFullName.get(cleanName);
          matchMethod = 'FullName';
        } else if (userByFullName.has(cleanName.toLowerCase())) {
          matchedUser = userByFullName.get(cleanName.toLowerCase());
          matchMethod = 'FullName (lowercase)';
        }
      }
      
      // 6. Intentar por nombre normalizado (sin números, sin tildes)
      if (!matchedUser && authorName) {
        const normalizedName = authorName.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/\d+$/, '')
          .trim();
        
        // Buscar en displayNames
        for (const [name, user] of userByDisplayName) {
          const normalizedKey = name.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/\d+$/, '')
            .trim();
          
          if (normalizedKey === normalizedName) {
            matchedUser = user;
            matchMethod = 'Nombre normalizado';
            break;
          }
        }
        
        // Buscar en fullNames
        if (!matchedUser) {
          for (const [name, user] of userByFullName) {
            const normalizedKey = name.toLowerCase()
              .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
              .replace(/\d+$/, '')
              .trim();
            
            if (normalizedKey === normalizedName) {
              matchedUser = user;
              matchMethod = 'Nombre normalizado (fullName)';
              break;
            }
          }
        }
      }
      
      // 7. Intentar por coincidencia parcial de nombre
      if (!matchedUser && authorName) {
        const normalizedName = authorName.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '')
          .replace(/\d+$/, '');
        
        // Buscar coincidencia parcial
        for (const [name, user] of userByDisplayName) {
          const normalizedKey = name.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '')
            .replace(/\d+$/, '');
          
          if (normalizedName && normalizedKey) {
            if (normalizedName.includes(normalizedKey) || normalizedKey.includes(normalizedName)) {
              const minLength = Math.min(normalizedName.length, normalizedKey.length);
              if (minLength >= 5) {
                matchedUser = user;
                matchMethod = 'Coincidencia parcial';
                break;
              }
            }
          }
        }
      }
      
      // 8. Para usuarios anónimos, intentar matching por nombre
      if (!matchedUser && authorName) {
        const anonymousUser = users.find(u => 
          u.isAnonymous && 
          u.displayName && 
          u.displayName.toLowerCase().trim() === authorName.toLowerCase().trim()
        );
        
        if (anonymousUser) {
          matchedUser = anonymousUser;
          matchMethod = 'Usuario anónimo';
        }
      }
      
      if (matchedUser && matchedUser.uid) {
        if (!authorArticlesMap.has(matchedUser.uid)) {
          authorArticlesMap.set(matchedUser.uid, []);
        }
        
        // Verificar que el artículo no esté duplicado
        const articleExists = authorArticlesMap.get(matchedUser.uid).some(a => 
          a.numeroArticulo === article.numeroArticulo
        );
        
        if (!articleExists) {
          authorArticlesMap.get(matchedUser.uid).push({
            title: article.titulo,
            titleEn: article.tituloEnglish || article.titulo,
            submissionId: article.submissionId,
            fecha: article.fecha,
            volumen: article.volumen,
            numero: article.numero,
            area: article.area,
            numeroArticulo: article.numeroArticulo,
            pdfUrl: article.pdfUrl,
            slug: articleSlug,  // Usar el permalink o slug generado
            permalink: article.permalink || articleSlug  // Guardar el permalink original
          });
          matchedCount++;
          console.log(`      ✅ Match por ${matchMethod}: ${matchedUser.displayName}`);
          console.log(`      📄 Artículo: ${article.titulo}`);
          console.log(`      🔗 Slug: ${articleSlug}`);
        } else {
          console.log(`      ⚠️ Artículo ya existe para ${matchedUser.displayName}`);
        }
      } else {
        unmatchedCount++;
        console.log(`      ❌ No se encontró match para: ${authorName}`);
      }
    });
  });
  
  // Asignar artículos a cada usuario
  const usersWithArticles = users.map(user => {
    const userArticles = authorArticlesMap.get(user.uid) || [];
    return {
      ...user,
      articles: userArticles
    };
  });
  
  // Estadísticas
  console.log(`\n📊 Estadísticas de matching:`);
  console.log(`   ✅ Matches exitosos: ${matchedCount}`);
  console.log(`   ❌ Sin match: ${unmatchedCount}`);
  console.log(`   👥 Usuarios con artículos: ${usersWithArticles.filter(u => u.articles.length > 0).length}`);
  
  return usersWithArticles;
}
// ========== GENERAR REDIRECCIONES PARA ARTÍCULOS ==========
function generateArticleRedirects(users) {
  console.log('🔄 Generando redirecciones para artículos...');
  
  // Crear un mapa de submissionId → nuevo slug
  const redirectMap = new Map();
  
  users.forEach(user => {
    user.articles.forEach(article => {
      if (article.submissionId) {
        // Usar el permalink si existe, o generar slug como fallback
        const slug = article.permalink || article.slug || (generateSlug(article.title || '') + '-' + (article.numeroArticulo || ''));
        redirectMap.set(article.submissionId, slug);
      }
    });
  });
  
  // Generar archivos de redirección para cada submissionId
  redirectMap.forEach((slug, submissionId) => {
    const redirectEs = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0; url=/articles/article-${slug}.html">
  <title>Redirigiendo...</title>
</head>
<body>
  <p>Este artículo se ha movido. <a href="/articles/article-${slug}.html">Haz clic aquí</a>.</p>
</body>
</html>`;

    const redirectEn = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0; url=/articles/article-${slug}EN.html">
  <title>Redirecting...</title>
</head>
<body>
  <p>This article has moved. <a href="/articles/article-${slug}EN.html">Click here</a>.</p>
</body>
</html>`;

    // Asegurar que existe el directorio /article
    const articleDir = path.join(__dirname, 'article');
    if (!fs.existsSync(articleDir)) {
      fs.mkdirSync(articleDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(articleDir, `${submissionId}.html`), redirectEs);
    fs.writeFileSync(path.join(articleDir, `${submissionId}.EN.html`), redirectEn);
  });
  
  console.log(`✅ ${redirectMap.size} redirecciones de artículos generadas`);
}

// ========== GENERADOR HTML MEJORADO ==========
function generateHTML(user, lang) {
  const isSpanish = lang === 'es';
  const roles = user.roles || [];

const isRevisorRole = r => {
  const x = r.toLowerCase().trim();
  return x === 'revisor' || x === 'reviewer';
};

const isAuthorRole = r => {
  const x = r.toLowerCase().trim();
  return x === 'autor' || x === 'author';
};

const visibleRoles =
    roles.length > 1
      ? roles.filter(r => !isAuthorRole(r) && !isRevisorRole(r))
      : roles.filter(r => !isRevisorRole(r));


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

  const isEditorEnJefe = roles.some(r => 
    r.toLowerCase().includes('editor en jefe') || r.toLowerCase() === 'editor-in-chief'
  );

  let contactInfo = '';
  
  if (user.isAnonymous) {
    contactInfo = `
      <div class="profile-inst">
        <span class="italic text-gray-500">${isSpanish ? 'Autor colaborador' : 'Contributing author'}</span>
      </div>
    `;
  } else if (isEditorEnJefe) {
    const institutionalEmail = `${(user.firstName || '').toLowerCase()}.${(user.lastName || '').toLowerCase()}@revistacienciasestudiantes.com`.replace(/\s/g, '');
    contactInfo = `
      <div class="profile-inst"><a href="mailto:${institutionalEmail}">${institutionalEmail}</a></div>
      <div class="profile-inst">San Felipe, Valparaíso, Chile</div>
    `;
  } else if (user.publicEmail) {
    contactInfo = `
      <div class="profile-inst"><a href="mailto:${user.publicEmail}">${user.publicEmail}</a></div>
    `;
  }
// ========== FUNCIÓN PARA OBTENER ARTÍCULOS ==========
async function fetchAllArticles() {
  try {
    console.log('📥 Descargando articles.json...');
    const response = await fetch(ARTICLES_JSON_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const articles = await response.json();
    console.log(`✅ ${articles.length} artículos cargados`);
    return articles;
  } catch (error) {
    console.error('❌ Error descargando articles.json:', error.message);
    return [];
  }
}
// En la sección de artículos del HTML generado
const articlesHtml = user.articles && user.articles.length > 0 ? `
  <section class="articles-section">
    <h2 class="section-title">
      ${isSpanish ? 'Publicaciones' : 'Publications'}
      <span class="article-count">${user.articles.length}</span>
    </h2>
    <div class="articles-grid">
      ${user.articles.map(article => {
        const fecha = new Date(article.fecha);
        const año = fecha.getFullYear();
        const mes = fecha.toLocaleString(isSpanish ? 'es' : 'en', { month: 'short' });
        
        // USAR PERMALINK SI EXISTE, O SLUG COMO FALLBACK
        const articleSlug = article.permalink || article.slug || (generateSlug(article.title || '') + '-' + (article.numeroArticulo || ''));
        
        return `
        <a href="/articles/article-${articleSlug}.html" class="article-card">
          <div class="article-card-header">
            <span class="article-area">${article.area || (isSpanish ? 'Artículo' : 'Article')}</span>
            <span class="article-meta-badge">Vol. ${article.volumen} • N° ${article.numero}</span>
          </div>
          <h3 class="article-title">${isSpanish ? article.title : (article.titleEn || article.title)}</h3>
          <div class="article-footer">
            <span class="article-date">
              <span class="article-icon">${icons.calendar}</span>
              ${mes} ${año}
            </span>
            ${article.pdfUrl ? `
              <span class="article-pdf-link" onclick="event.stopPropagation(); window.open('${article.pdfUrl}', '_blank'); return false;">
                <span class="article-icon">📄</span> PDF
              </span>
            ` : ''}
          </div>
        </a>
      `}).join('')}
    </div>
  </section>
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
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Lora:wght@400;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #007398;
      --primary-light: #e6f3f8;
      --orcid-green: #A6CE39;
      --text: #1a1a1a;
      --text-light: #4a4a4a;
      --grey: #555;
      --light-grey: #f8f8f8;
      --border: #e0e0e0;
      --card-shadow: 0 2px 4px rgba(0,0,0,0.02);
      --card-hover-shadow: 0 8px 16px rgba(0,115,152,0.08);
      --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    /* EFECTO DE TEXTURA DE PAPEL */
    body::before {
      content: "";
      position: fixed;
      top: 0; left: 0;
      width: 100vw; height: 100vh;
      opacity: 0.03;
      pointer-events: none;
      z-index: 9999;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
    }
    
    /* BARRA DE LECTURA PROGRESIVA */
    .scroll-progress {
      position: fixed;
      top: 0; left: 0;
      height: 3px;
      background: linear-gradient(to right, var(--primary), var(--orcid-green));
      width: 0%;
      z-index: 10000;
    }
    
    /* REVELACIÓN AL HACER SCROLL */
    .reveal {
      opacity: 0;
      transform: translateY(30px);
      transition: all 0.8s cubic-bezier(0.2, 1, 0.3, 1);
    }
    
    .reveal.active {
      opacity: 1;
      transform: translateY(0);
    }
    
    /* SELECCIÓN DE TEXTO PERSONALIZADA */
    ::selection {
      background: var(--primary-light);
      color: var(--primary);
    }
    
    /* CUSTOM SCROLLBAR */
    ::-webkit-scrollbar { 
      width: 8px; 
    }
    ::-webkit-scrollbar-track { 
      background: var(--light-grey); 
    }
    ::-webkit-scrollbar-thumb { 
      background: #ccc; 
      border-radius: 10px; 
    }
    ::-webkit-scrollbar-thumb:hover { 
      background: var(--primary); 
    }
    
    body { 
      margin: 0; 
      font-family: 'Lora', serif; 
      color: var(--text); 
      background: #fff; 
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
    }
    
    /* MEJORA DE NAVEGACIÓN CON GLASSMORPHISM */
    .top-nav { 
      padding: 20px; 
      text-align: center; 
      border-bottom: 1px solid var(--border); 
      font-family: 'Inter', sans-serif; 
      text-transform: uppercase; 
      letter-spacing: 2px; 
      font-size: clamp(10px, 2.5vw, 11px);
      position: sticky;
      top: 0;
      background: rgba(255, 255, 255, 0.8);
      backdrop-filter: blur(10px);
      z-index: 1000;
    }
    
    .top-nav a { 
      text-decoration: none; 
      color: var(--text); 
      font-weight: 700; 
    }
    
    .profile-hero { 
      max-width: 1200px; 
      margin: 40px auto; 
      padding: 0 24px; 
      display: grid; 
      grid-template-columns: 280px 1fr; 
      gap: 48px; 
      align-items: start; 
    }
    
    .sidebar-assets { 
      display: flex; 
      flex-direction: column; 
      gap: 25px; 
    }
    
    .img-container { 
      width: 280px; 
    }
    
    /* EFECTO MAGNÉTICO EN FOTO */
    .profile-img { 
      width: 100%; 
      aspect-ratio: 1/1; 
      object-fit: cover; 
      filter: grayscale(10%); 
      box-shadow: 20px 20px 0 var(--light-grey); 
      border-radius: 4px; 
      transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    
    .profile-img:hover {
      box-shadow: 20px 20px 0 var(--primary-light);
      transform: scale(1.02) rotate(1deg);
    }
    
    .no-img { 
      width: 280px; 
      height: 280px; 
      background: var(--light-grey); 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      font-family: 'Inter', sans-serif; 
      color: #999; 
    }
    
    .profile-social { 
      display: flex; 
      gap: 15px; 
      justify-content: flex-start; 
      padding-top: 10px; 
    }
    
    .profile-social a { 
      color: var(--grey); 
      width: 20px; 
      height: 20px; 
      transition: var(--transition); 
      opacity: 0.7; 
    }
    
    .profile-social a:hover { 
      color: var(--primary); 
      opacity: 1; 
      transform: translateY(-2px); 
    }
    
    .profile-info h1 { 
      font-family: 'Playfair Display', serif; 
      font-size: clamp(2.5rem, 5vw, 3.8rem); 
      margin: 0 0 10px; 
      line-height: 1.1; 
      font-weight: 900; 
      letter-spacing: -1px; 
    }
    
    .profile-role { 
      font-family: 'Inter', sans-serif; 
      color: var(--primary); 
      text-transform: uppercase; 
      letter-spacing: 4px; 
      font-size: clamp(11px, 2vw, 13px); 
      font-weight: 700; 
      margin-bottom: 20px; 
      display: block; 
    }
    
    .profile-inst { 
      font-family: 'Inter', sans-serif; 
      color: var(--grey); 
      font-size: 14px; 
      margin-top: 5px; 
    }
    
    .profile-inst a { 
      color: var(--grey); 
      text-decoration: none; 
      border-bottom: 1px dotted var(--border); 
    }
    
    .profile-inst a:hover { 
      color: var(--primary); 
      border-bottom-color: var(--primary); 
    }
    
    .orcid-container { 
      margin: 20px 0; 
    }
    
    .orcid-link { 
      display: inline-flex; 
      align-items: center; 
      text-decoration: none; 
      color: var(--grey); 
      font-family: 'Inter', sans-serif; 
      font-size: 13px; 
      padding: 6px 12px 6px 8px; 
      background: var(--light-grey); 
      border-radius: 4px; 
      transition: var(--transition); 
    }
    
    .orcid-link:hover { 
      background: #eee; 
      transform: translateY(-1px);
    }
    
    .orcid-icon { 
      width: 20px; 
      height: 20px; 
      margin-right: 10px; 
    }
    
    .container { 
      max-width: 1000px; 
      margin: 0 auto 80px; 
      padding: 0 24px; 
    }
    
    .section-title { 
      font-family: 'Inter', sans-serif; 
      font-size: 11px; 
      font-weight: 800; 
      text-transform: uppercase; 
      letter-spacing: 3px; 
      border-bottom: 2px solid var(--text); 
      padding-bottom: 8px; 
      margin: 60px 0 30px; 
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .article-count {
      background: var(--primary-light);
      color: var(--primary);
      padding: 2px 8px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    
    .bio-text { 
      font-size: clamp(1rem, 2vw, 1.2rem); 
      color: var(--text-light); 
      text-align: justify; 
      line-height: 1.8;
    }
    
    .tags-container { 
      display: flex; 
      flex-wrap: wrap; 
      gap: 10px; 
    }
    
    .keyword-tag { 
      font-family: 'Inter', sans-serif; 
      font-size: 12px; 
      background: var(--light-grey); 
      padding: 6px 15px; 
      border-radius: 20px; 
      font-weight: 600; 
      transition: var(--transition);
    }
    
    .keyword-tag:hover {
      background: var(--primary-light);
      color: var(--primary);
    }
    
    /* ARTÍCULOS GRID MEJORADO */
    .articles-section {
      margin-top: 40px;
    }
    
    .articles-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 24px;
      margin-top: 20px;
    }
    
    .article-card {
      display: flex;
      flex-direction: column;
      text-decoration: none;
      background: white;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 24px;
      transition: var(--transition);
      box-shadow: var(--card-shadow);
    }
    
    .article-card:hover {
      transform: translateY(-4px);
      border-color: var(--primary);
      box-shadow: var(--card-hover-shadow);
    }
    
    .article-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      font-size: 11px;
      font-family: 'Inter', sans-serif;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .article-area {
      color: var(--primary);
      font-weight: 700;
    }
    
    .article-meta-badge {
      background: var(--light-grey);
      padding: 4px 8px;
      border-radius: 4px;
      color: var(--grey);
      font-weight: 600;
    }
    
    .article-title {
      font-family: 'Playfair Display', serif;
      font-size: 1.2rem;
      line-height: 1.4;
      margin: 0 0 20px;
      color: var(--text);
      font-weight: 700;
      flex-grow: 1;
    }
    
    .article-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: auto;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      font-family: 'Inter', sans-serif;
      font-size: 12px;
    }
    
    .article-date {
      display: flex;
      align-items: center;
      gap: 4px;
      color: var(--grey);
    }
    
    .article-pdf-link {
      color: var(--primary);
      text-decoration: none;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      transition: var(--transition);
    }
    
    .article-pdf-link:hover {
      gap: 6px;
    }
    
    .article-icon {
      width: 14px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    
    .footer-nav { 
      text-align: center; 
      padding: 60px 20px; 
      background: var(--light-grey); 
      margin-top: 100px; 
    }
    
    .footer-nav a { 
      font-family: 'Inter', sans-serif; 
      font-size: clamp(11px, 2vw, 12px); 
      text-decoration: none; 
      color: var(--primary); 
      font-weight: 700; 
      margin: 0 15px; 
      text-transform: uppercase; 
      transition: var(--transition);
    }
    
    .footer-nav a:hover {
      opacity: 0.8;
    }
    
    /* MEDIA QUERIES OPTIMIZADAS */
    @media (max-width: 850px) {
      .profile-hero { 
        grid-template-columns: 1fr; 
        text-align: center; 
        gap: 40px; 
        margin: 20px auto;
      }
      
      .sidebar-assets { 
        align-items: center; 
      }
      
      .img-container {
        width: min(280px, 60vw);
        margin: 0 auto;
      }
      
      .no-img {
        width: min(280px, 60vw);
        height: min(280px, 60vw);
        margin: 0 auto;
      }
      
      .profile-social { 
        justify-content: center; 
      }
      
      .orcid-link { 
        justify-content: center; 
        margin: 0 auto;
      }
      
      .profile-info h1 { 
        font-size: clamp(2rem, 8vw, 2.8rem); 
      }
    }
    
    @media (max-width: 480px) {
      .profile-hero {
        padding: 0 16px;
      }
      
      .container {
        padding: 0 16px;
      }
      
      .articles-grid {
        grid-template-columns: 1fr;
        gap: 16px;
      }
      
      .article-card {
        padding: 20px;
      }
      
      .article-card-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }
      
      .section-title {
        margin: 40px 0 20px;
      }
      
      .footer-nav a {
        display: inline-block;
        margin: 8px 12px;
      }
    }
    
    @media (max-width: 360px) {
      .article-footer {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
      }
    }
  </style>
</head>
<body>
  <div class="scroll-progress" id="scrollBar"></div>
  
  <nav class="top-nav"><a href="/">${isSpanish ? 'Revista Nacional de las Ciencias para Estudiantes' : 'The National Review of Sciences for Students'}</a></nav>
  
  <header class="profile-hero">
    <div class="sidebar-assets">
      <div class="img-container">
        ${user.imageUrl ? `<img src="${user.imageUrl}" alt="${user.displayName}" class="profile-img">` : '<div class="no-img">' + (isSpanish ? 'Sin imagen' : 'No image') + '</div>'}
      </div>
      ${socialHtml}
    </div>
    <div class="profile-info">
      <span class="profile-role">${rolesStr}</span>
      <h1>${user.displayName}</h1>
      <div class="profile-inst">${user.institution || ''}</div>
      ${orcidHtml}
      ${contactInfo}
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
    
    ${articlesHtml}
  </main>
  
  <footer class="footer-nav">
    <a href="/team/">← ${isSpanish ? 'Volver al Equipo' : 'Back to Team'}</a>
    <a href="/">${isSpanish ? 'Inicio' : 'Home'}</a>
  </footer>

  <script>
    // Barra de progreso de lectura
    window.onscroll = function() {
      let winScroll = document.body.scrollTop || document.documentElement.scrollTop;
      let height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      let scrolled = (winScroll / height) * 100;
      document.getElementById("scrollBar").style.width = scrolled + "%";
    };

    // Observer para revelar elementos al hacer scroll
    const observerOptions = {
      threshold: 0.1,
      rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          // Opcional: dejar de observar después de activar
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    // Aplicar a secciones y tarjetas
    document.addEventListener('DOMContentLoaded', function() {
      document.querySelectorAll('section, .article-card, .profile-hero').forEach(el => {
        el.classList.add('reveal');
        observer.observe(el);
      });
    });
  </script>
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
      imageUrl: data.imageUrl || '',
      isAnonymous: false,
      articles: [] // Inicializamos vacío
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
    imageUrl: data.imageUrl || '',
    isAnonymous: false,
    articles: []
  };
}

async function fetchAnonymousAuthors() {
  console.log('📥 Buscando coautores anónimos en submissions...');
  const snapshot = await db.collection('submissions')
    .where('status', 'in', ['published', 'accepted'])
    .get();
  
  const anonymousAuthorsMap = new Map();

  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.authors && Array.isArray(data.authors)) {
      data.authors.forEach(author => {
        if (author.uid) return;
        
        const name = `${author.firstName || ''} ${author.lastName || ''}`.trim();
        if (!name) return;
        
        if (!anonymousAuthorsMap.has(name)) {
          anonymousAuthorsMap.set(name, {
            name,
            firstName: author.firstName || '',
            lastName: author.lastName || '',
            institution: author.institution || '',
            orcid: author.orcid || '',
            articles: [],
            email: author.email
          });
        }
        
        const entry = anonymousAuthorsMap.get(name);
        entry.articles.push({
          title: data.title,
          submissionId: data.submissionId
        });
      });
    }
  });

  console.log(`✅ Encontrados ${anonymousAuthorsMap.size} coautores anónimos`);
  return Array.from(anonymousAuthorsMap.values());
}

function createAnonymousUser(authorData) {
  const name = authorData.name;
  const slug = generateSlug(name);
  
  const claimHash = crypto.createHash('sha256')
    .update(authorData.email + '-revista-secret')
    .digest('hex')
    .substring(0, 16);
  
  return {
    uid: `anon-${slug}-${Date.now().toString(36)}`,
    displayName: name,
    firstName: authorData.firstName,
    lastName: authorData.lastName,
    roles: ['Autor'],
    description: { 
      es: `Autor colaborador que ha publicado en nuestra revista.`, 
      en: `Contributing author who has published in our journal.` 
    },
    interests: { es: [], en: [] },
    institution: authorData.institution || '',
    orcid: authorData.orcid || '',
    publicEmail: null,
    social: {},
    imageUrl: '',
    slug: slug,
    isAnonymous: true,
    claimHash: claimHash,
    claimable: true,
    articles: authorData.articles || []
  };
}

function assignSlugsPreserving(users, existingUsers) {
  const existingMap = new Map(existingUsers.map(u => [u.uid, u]));
  const usedSlugs = new Map();
  
  existingUsers.forEach(u => {
    if (u.slug) usedSlugs.set(u.slug, u.uid);
  });
  
  return users.map(user => {
    const existing = existingMap.get(user.uid);
    const base = generateSlug(user.displayName || `${user.firstName} ${user.lastName}`);
    
    if (existing && existing.slug === base) {
      return { ...user, slug: existing.slug };
    }
    
    if (existing && existing.slug && existing.slug !== base) {
      console.log(`ℹ️ Manteniendo slug antiguo para ${user.displayName}: ${existing.slug}`);
      return { ...user, slug: existing.slug };
    }
    
    let slug = base;
    let count = 1;
    
    while (usedSlugs.has(slug) && usedSlugs.get(slug) !== user.uid) {
      slug = `${base}${count}`;
      count++;
    }
    
    usedSlugs.set(slug, user.uid);
    return { ...user, slug };
  });
}

function generateRedirects(oldUsers, newUsers) {
  const oldMap = new Map(oldUsers.map(u => [u.uid, u]));
  
  for (const newUser of newUsers) {
    const oldUser = oldMap.get(newUser.uid);
    if (oldUser && oldUser.slug !== newUser.slug) {
      console.log(`🔄 Slug cambiado: ${oldUser.slug} → ${newUser.slug}`);
      
      const redirectEs = createRedirectHtml(oldUser.slug, newUser.slug, 'es');
      const redirectEn = createRedirectHtml(oldUser.slug, newUser.slug, 'en');
      
      fs.writeFileSync(path.join(PUBLIC_DIR, `${oldUser.slug}.html`), redirectEs);
      fs.writeFileSync(path.join(PUBLIC_DIR, `${oldUser.slug}.EN.html`), redirectEn);
    }
  }
}

function generateHtmls(users) {
  for (const user of users) {
    const htmlEs = generateHTML(user, 'es');
    const htmlEn = generateHTML(user, 'en');
    fs.writeFileSync(path.join(PUBLIC_DIR, `${user.slug}.html`), htmlEs);
    fs.writeFileSync(path.join(PUBLIC_DIR, `${user.slug}.EN.html`), htmlEn);
    console.log(`✅ Generado: ${user.slug}.html para ${user.displayName}${user.isAnonymous ? ' (anónimo)' : ''} - ${user.articles.length} artículos`);
  }
}
// ========== MODO DE EJECUCIÓN ==========
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'full';
  
  console.log('🚀 Iniciando build en modo:', mode);
  
  const existingUsers = readExistingTeamJson();
  
  // Obtener artículos primero (los necesitamos para todos los modos)
  const articles = await fetchAllArticles();
  
  if (mode === 'full' || mode === '--full') {
    console.log('📥 Obteniendo usuarios registrados de Firebase...');
    const registeredUsers = await fetchAllUsers();
    console.log(`   ✅ ${registeredUsers.length} usuarios registrados obtenidos`);
    
    const anonymousAuthors = await fetchAnonymousAuthors();
    console.log(`   ✅ ${anonymousAuthors.length} autores anónimos obtenidos`);
    
    const anonymousUsers = anonymousAuthors.map(author => createAnonymousUser(author));
    
    const allUsers = [...registeredUsers, ...anonymousUsers];
    console.log(`   📊 Total usuarios: ${allUsers.length} (${registeredUsers.length} registrados + ${anonymousUsers.length} anónimos)`);
    
    const usersWithSlug = assignSlugsPreserving(allUsers, existingUsers);
    
    // MATCHEAR CON ARTÍCULOS
    console.log('\n🔗 Iniciando matching de autores con artículos...');
    const usersWithArticles = matchAuthorsWithArticles(usersWithSlug, articles);
    
    // Debug: mostrar usuarios con artículos
    const usersWithArticlesCount = usersWithArticles.filter(u => u.articles && u.articles.length > 0);
    console.log(`\n📊 Resumen de matching:`);
    console.log(`   ✅ ${usersWithArticlesCount.length} usuarios tienen artículos asociados`);
    usersWithArticlesCount.forEach(u => {
      console.log(`   👤 ${u.displayName} (${u.uid}): ${u.articles.length} artículos`);
    });
    
    generateRedirects(existingUsers, usersWithArticles);
    
    saveTeamJson(usersWithArticles);
    
    generateHtmls(usersWithArticles);
    generateArticleRedirects(usersWithArticles);
    
    console.log(`\n🎉 Build completo finalizado.`);
    console.log(`   Total: ${usersWithArticles.length} usuarios`);
    console.log(`   Registrados: ${registeredUsers.length}`);
    console.log(`   Anónimos: ${anonymousUsers.length}`);
    console.log(`   Con artículos: ${usersWithArticlesCount.length}`);
    
  } else if (mode === '--user') {
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
    
    console.log(`   ✅ Usuario encontrado: ${user.displayName}`);
    
    const otherUsers = existingUsers.filter(u => u.uid !== uid);
    const allUsers = [...otherUsers, user];
    
    const usersWithSlug = assignSlugsPreserving(allUsers, existingUsers);
    
    // MATCHEAR CON ARTÍCULOS
    console.log('\n🔗 Matcheando usuario con artículos...');
    const usersWithArticles = matchAuthorsWithArticles(usersWithSlug, articles);
    
    const updatedUser = usersWithArticles.find(u => u.uid === uid);
    const oldUser = existingUsers.find(u => u.uid === uid);
    
    console.log(`\n📊 Artículos encontrados para ${updatedUser?.displayName}: ${updatedUser?.articles?.length || 0}`);
    
    if (oldUser && oldUser.slug !== updatedUser.slug) {
      console.log(`🔄 Slug cambiado: ${oldUser.slug} → ${updatedUser.slug}`);
      const redirectEs = createRedirectHtml(oldUser.slug, updatedUser.slug, 'es');
      const redirectEn = createRedirectHtml(oldUser.slug, updatedUser.slug, 'en');
      fs.writeFileSync(path.join(PUBLIC_DIR, `${oldUser.slug}.html`), redirectEs);
      fs.writeFileSync(path.join(PUBLIC_DIR, `${oldUser.slug}.EN.html`), redirectEn);
    }
    
    saveTeamJson(usersWithArticles);
    generateHtmls([updatedUser]);
    
    console.log(`✅ Usuario ${uid} actualizado.`);
    
  } else if (mode === '--claim') {
    const uid = args[1];
    const claimHash = args[2];
    
    if (!uid || !claimHash) {
      console.error('❌ Uso: build.js --claim <uid> <claimHash>');
      process.exit(1);
    }
    
    const anonUser = existingUsers.find(u => u.uid === uid && u.isAnonymous);
    if (!anonUser) {
      console.error('❌ Usuario anónimo no encontrado');
      process.exit(1);
    }
    
    if (anonUser.claimHash !== claimHash) {
      console.error('❌ Hash de reclamación inválido');
      process.exit(1);
    }
    
    console.log(`✅ Hash válido. El perfil ${anonUser.displayName} puede ser reclamado.`);
    console.log(`Instrucciones para el usuario:`);
    console.log(`1. Crear cuenta con email: ${anonUser.email}`);
    console.log(`2. El equipo editorial asociará su UID con este perfil.`);
    
  } else if (mode === '--debug-match') {
    // Modo especial para debug de matching
    console.log('🔍 MODO DEBUG: Verificando matching de autores...\n');
    
    const registeredUsers = await fetchAllUsers();
    const anonymousAuthors = await fetchAnonymousAuthors();
    const anonymousUsers = anonymousAuthors.map(author => createAnonymousUser(author));
    const allUsers = [...registeredUsers, ...anonymousUsers];
    
    console.log(`📊 Total usuarios: ${allUsers.length}`);
    console.log(`📊 Total artículos: ${articles.length}\n`);
    
    // Buscar a Josefina específicamente
    const josefina = allUsers.find(u => 
      u.displayName?.toLowerCase().includes('josefina') ||
      u.firstName?.toLowerCase().includes('josefina') ||
      u.lastName?.toLowerCase().includes('perez') ||
      u.lastName?.toLowerCase().includes('pérez')
    );
    
    if (josefina) {
      console.log('👤 Usuario Josefina encontrado:');
      console.log(JSON.stringify({
        uid: josefina.uid,
        displayName: josefina.displayName,
        firstName: josefina.firstName,
        lastName: josefina.lastName,
        slug: josefina.slug,
        email: josefina.publicEmail,
        isAnonymous: josefina.isAnonymous
      }, null, 2));
    } else {
      console.log('❌ No se encontró usuario con nombre Josefina');
    }
    
    // Buscar artículos con Josefina
    const josefinaArticles = articles.filter(article => {
      const autoresStr = JSON.stringify(article.autores).toLowerCase();
      return autoresStr.includes('josefina') || 
             autoresStr.includes('perez') || 
             autoresStr.includes('pérez');
    });
    
    console.log(`\n📄 Artículos que mencionan a Josefina: ${josefinaArticles.length}`);
    josefinaArticles.forEach(article => {
      console.log(`\n   Artículo: ${article.titulo}`);
      console.log(`   Autores: ${JSON.stringify(article.autores, null, 2)}`);
      console.log(`   AuthorIds: ${JSON.stringify(article.authorIds || [], null, 2)}`);
    });
    
    // Probar matching
    console.log('\n🔗 Probando matching...');
    const usersWithArticles = matchAuthorsWithArticles(allUsers, articles);
    
    const josefinaWithArticles = usersWithArticles.find(u => 
      u.displayName?.toLowerCase().includes('josefina') ||
      u.firstName?.toLowerCase().includes('josefina')
    );
    
    if (josefinaWithArticles) {
      console.log(`\n✅ Josefina tiene ${josefinaWithArticles.articles?.length || 0} artículos`);
      josefinaWithArticles.articles?.forEach(a => {
        console.log(`   - ${a.title}`);
      });
    }
    
  } else {
    console.error('❌ Modo no reconocido. Usa: build.js [--full|--user <uid>|--claim <uid> <hash>|--debug-match]');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Error en build:', error);
  process.exit(1);
});
