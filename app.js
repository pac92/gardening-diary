"use strict";
/* ═══════════════════════════════════════════════════════════════════
   CONSTANTES
   ═══════════════════════════════════════════════════════════════════ */

const APP = 'diario-jardineria';
const ESQUEMA = 3;               // versión del formato del zip (3: media, episodios, productos)
const DB_NOMBRE = 'jardin';
const DB_VERSION = 2;            // 2: media_blobs sin keyPath + media_thumbs
const MAX_DIAS_MOTOR = 120;      // tope de iteraciones del bucle día a día

/* MOTOR_INICIO */
const PERFILES = {
  bancal:         { mm_riego_completo: 15, techo_dias: 8, etiqueta: 'Bancal',         calido: 4, frio: 9 },
  maceta_grande:  { mm_riego_completo:  8, techo_dias: 3, etiqueta: 'Maceta grande',  calido: 3, frio: 7 },
  maceta_pequeña: { mm_riego_completo:  5, techo_dias: 1, etiqueta: 'Maceta pequeña', calido: 2, frio: 5 },
};

const MEDIA_LADO = 1600, MEDIA_Q = 0.8;   // foto que se guarda
const THUMB_LADO = 200,  THUMB_Q = 0.7;   // miniatura para listas
const DIAS_REINSPECCION = 6;              // 5–7 días tras un tratamiento
const DIAS_CIERRE_SUGERIDO = 30;          // episodio sin novedades: se pregunta, no se cierra solo
const AVISO_CUOTA = 0.8;
const DIAS_BACKUP_COMPLETO = 30;

const TIPOS_EVENTO = {
  riego:      'Riego',
  lluvia:     'Lluvia',
  siembra:    'Siembra',
  trasplante: 'Trasplante',
  poda:       'Poda',
  abonado:    'Abonado',
  cosecha:    'Cosecha',
  baja:       'Baja',
  nota:       'Nota',
  observacion:'Síntoma',
  tratamiento:'Tratamiento',
};

const SEVERIDAD = { 0:'sin síntomas', 1:'leve', 2:'media', 3:'grave' };
const METODOS = { pulverizacion:'pulverización', riego:'con el riego', manual:'manual', trampa:'trampa' };

const CATEGORIAS_AGENTE = {
  insecto:'Insecto', acaro:'Ácaro', hongo:'Hongo', bacteria:'Bacteria',
  virus:'Virus', molusco:'Molusco', carencia:'Carencia', abiotico:'Abiótico',
};
/* Un agente `carencia` o `abiotico` no se trata con fitosanitarios: la app
   ni siquiera los ofrece. Es el error más común y el más caro. */
const NO_BIOTICO = new Set(['carencia','abiotico']);

const SEMILLA_AGENTES = [
  ['Pulgón','insecto'], ['Mosca blanca','insecto'], ['Cochinilla algodonosa','insecto'],
  ['Cochinilla parda','insecto'], ['Trips','insecto'], ['Minador de hoja','insecto'],
  ['Oruga / rosquilla','insecto'], ['Mosca de la fruta','insecto'], ['Picudo rojo','insecto'],
  ['Araña roja','acaro'], ['Ácaro del bronceado','acaro'],
  ['Oídio','hongo'], ['Mildiu','hongo'], ['Roya','hongo'], ['Botritis','hongo'],
  ['Alternaria','hongo'], ['Fusarium','hongo'], ['Negrilla','hongo'],
  ['Caracoles y babosas','molusco'],
  ['Virus del mosaico','virus'], ['Fuego bacteriano','bacteria'],
  ['Clorosis férrica','carencia'], ['Falta de nitrógeno','carencia'], ['Carencia de magnesio','carencia'],
  ['Exceso de riego','abiotico'], ['Falta de riego','abiotico'], ['Golpe de sol','abiotico'],
  ['Daño por viento o salitre','abiotico'], ['Helada','abiotico'],
];

/* Clases de ventana fenológica. `prescriptiva` decide si genera pendiente;
   `evento` es el tipo de evento del log que la cierra. */
const CLASES_VENTANA = {
  siembra_semillero: { etiqueta:'Siembra en semillero', verbo:'Sembrar en semillero', prescriptiva:true,  evento:'siembra',    color:'var(--savia)' },
  siembra_directa:   { etiqueta:'Siembra directa',      verbo:'Sembrar',              prescriptiva:true,  evento:'siembra',    color:'var(--savia)' },
  trasplante:        { etiqueta:'Trasplante',           verbo:'Trasplantar',          prescriptiva:true,  evento:'trasplante', color:'var(--agua)' },
  poda:              { etiqueta:'Poda',                 verbo:'Podar',                prescriptiva:true,  evento:'poda',       color:'var(--seco)' },
  abonado:           { etiqueta:'Abonado',              verbo:'Abonar',               prescriptiva:true,  evento:'abonado',    color:'var(--tierra)' },
  floracion:         { etiqueta:'Floración',            prescriptiva:false, color:'var(--flor)' },
  produccion:        { etiqueta:'Producción',           prescriptiva:false, evento:'cosecha', color:'var(--fruto)' },
  reposo:            { etiqueta:'Reposo',               prescriptiva:false, color:'var(--tenue)' },
};

const DIAS_SILENCIO = 14;        // una ventana abierta más de dos semanas deja de ser novedad

/* Catálogo semilla: punto de partida para clima mediterráneo de costa, NO una
   fuente de autoridad. Se importa una vez desde Ajustes, nunca pisa lo tuyo, y
   se corrige con la experiencia del jardín.
   Notación: [clase, mesDesde, quincenaDesde, mesHasta, quincenaHasta, cadaDias|0, nota] */
const SEMILLA_TAXONES = [
  ['Tomate', [
    ['siembra_semillero',1,1,2,2,0,'protegido de heladas tardías'],
    ['trasplante',3,2,5,1,0,''],
    ['abonado',5,1,9,2,15,''],
    ['produccion',6,1,10,2,0,''],
  ]],
  ['Pimiento', [
    ['siembra_semillero',1,2,2,2,0,'necesita calor para germinar'],
    ['trasplante',4,1,5,1,0,''],
    ['abonado',6,1,9,1,15,''],
    ['produccion',7,1,10,2,0,''],
  ]],
  ['Berenjena', [
    ['siembra_semillero',1,2,2,2,0,''],
    ['trasplante',4,1,5,2,0,''],
    ['produccion',7,1,10,1,0,''],
  ]],
  ['Calabacín', [
    ['siembra_directa',3,2,6,2,30,'siembras escalonadas para alargar la cosecha'],
    ['produccion',6,1,10,1,0,''],
  ]],
  ['Pepino', [
    ['siembra_directa',4,1,6,1,30,''],
    ['produccion',6,2,9,2,0,''],
  ]],
  ['Judía verde', [
    ['siembra_directa',3,2,8,1,21,'escalonar cada tres semanas'],
    ['produccion',6,1,10,2,0,''],
  ]],
  ['Lechuga', [
    ['siembra_semillero',1,2,5,1,21,'escalonar; en verano se espiga'],
    ['siembra_directa',9,1,11,2,21,''],
    ['produccion',3,1,6,2,0,''],
  ]],
  ['Acelga', [
    ['siembra_directa',2,1,5,1,30,''],
    ['siembra_directa',9,1,10,2,30,''],
    ['produccion',5,1,12,2,0,''],
  ]],
  ['Espinaca', [
    ['siembra_directa',9,2,11,2,21,'cultivo de otoño-invierno'],
    ['produccion',11,1,3,1,0,''],
  ]],
  ['Zanahoria', [
    ['siembra_directa',2,1,4,2,30,''],
    ['siembra_directa',9,1,10,2,30,''],
    ['produccion',5,1,7,2,0,''],
  ]],
  ['Rábano', [
    ['siembra_directa',9,1,4,2,14,'muy rápido; escalonar mucho'],
    ['produccion',10,1,5,2,0,''],
  ]],
  ['Cebolla', [
    ['siembra_semillero',8,2,10,2,0,''],
    ['trasplante',11,1,1,2,0,''],
    ['produccion',5,1,7,1,0,''],
  ]],
  ['Ajo', [
    ['siembra_directa',10,1,12,1,0,'diente hacia arriba'],
    ['produccion',6,1,7,1,0,''],
  ]],
  ['Puerro', [
    ['siembra_semillero',2,1,4,2,0,''],
    ['trasplante',5,1,7,1,0,''],
    ['produccion',10,1,2,2,0,''],
  ]],
  ['Guisante', [
    ['siembra_directa',10,1,1,2,30,''],
    ['produccion',2,1,5,1,0,''],
  ]],
  ['Haba', [
    ['siembra_directa',10,1,12,1,0,''],
    ['produccion',2,1,5,1,0,''],
  ]],
  ['Patata', [
    ['siembra_directa',1,2,3,1,0,''],
    ['produccion',5,1,7,1,0,''],
  ]],
  ['Fresa', [
    ['trasplante',9,1,11,2,0,'renovar las matas cada 2-3 años'],
    ['abonado',2,1,5,2,21,''],
    ['produccion',3,1,6,1,0,''],
  ]],
  ['Limonero', [
    ['poda',2,2,3,2,0,'tras la cosecha y sin riesgo de heladas'],
    ['abonado',2,1,9,2,30,''],
    ['floracion',3,1,5,1,0,'refloración en septiembre'],
    ['produccion',11,1,3,2,0,''],
  ]],
  ['Naranjo', [
    ['poda',3,1,4,1,0,'tras la cosecha'],
    ['abonado',2,1,9,2,30,''],
    ['floracion',4,1,5,1,0,''],
    ['produccion',12,1,3,2,0,''],
  ]],
  ['Olivo', [
    ['poda',2,1,3,2,0,'antes de la brotación'],
    ['floracion',5,1,5,2,0,''],
    ['produccion',11,1,12,2,0,''],
  ]],
  ['Higuera', [
    ['poda',1,1,2,2,0,'en reposo vegetativo'],
    ['produccion',6,2,9,1,0,'brevas y luego higos'],
  ]],
  ['Parra', [
    ['poda',12,1,1,2,0,'poda de invierno, en reposo'],
    ['floracion',5,1,5,2,0,''],
    ['produccion',8,1,10,1,0,''],
  ]],
  ['Aguacate', [
    ['poda',3,2,4,2,0,'ligera; teme el sol directo en la madera'],
    ['abonado',3,1,9,1,30,''],
    ['floracion',3,1,5,2,0,''],
    ['produccion',11,1,4,2,0,''],
  ]],
  ['Albahaca', [
    ['siembra_semillero',3,1,5,2,21,''],
    ['poda',5,1,9,2,14,'pinzar las flores para que siga dando hoja'],
    ['produccion',6,1,10,1,0,''],
  ]],
  ['Perejil', [
    ['siembra_directa',2,1,5,1,30,''],
    ['siembra_directa',9,1,10,1,30,''],
    ['produccion',4,1,12,2,0,''],
  ]],
  ['Romero', [
    ['poda',3,2,4,2,0,'tras la floración, sin llegar a madera vieja'],
    ['floracion',2,1,5,1,0,''],
  ]],
  ['Tomillo', [
    ['poda',4,1,5,2,0,'tras la floración'],
    ['floracion',4,1,6,1,0,''],
  ]],
  ['Hierbabuena', [
    ['poda',3,1,9,2,30,'cortar a menudo para que no se ahíle'],
    ['reposo',12,1,2,2,0,''],
  ]],
  ['Lavanda', [
    ['poda',8,2,9,2,0,'tras la floración, sin tocar madera vieja'],
    ['floracion',5,1,7,2,0,''],
  ]],
  ['Rosal', [
    ['poda',12,2,2,1,0,'poda de invierno, en reposo'],
    ['abonado',3,1,9,1,30,''],
    ['floracion',4,1,6,2,0,'refloración en otoño'],
  ]],
  ['Buganvilla', [
    ['poda',2,2,3,2,0,'antes de la brotación'],
    ['floracion',5,1,10,2,0,''],
  ]],
  ['Jazmín', [
    ['poda',2,2,3,2,0,''],
    ['floracion',5,1,9,2,0,''],
  ]],
  ['Geranio', [
    ['poda',2,1,3,1,0,'aclarar tallos secos al final del invierno'],
    ['abonado',4,1,9,2,21,''],
    ['floracion',3,1,11,1,0,''],
  ]],
  ['Monstera', [
    ['trasplante',3,1,5,2,0,'cada 2 años, o cuando saque raíces por el drenaje'],
    ['abonado',4,1,9,2,21,''],
    ['reposo',11,1,2,2,0,'sin abono y con menos riego'],
  ]],
  ['Potos', [
    ['trasplante',3,1,5,2,0,''],
    ['abonado',4,1,9,2,30,''],
    ['reposo',11,1,2,2,0,''],
  ]],
  ['Sansevieria', [
    ['trasplante',3,2,5,2,0,'cada 3 años; le gusta ir justa de maceta'],
    ['abonado',5,1,8,2,45,''],
    ['reposo',11,1,2,2,0,'aguanta semanas sin agua'],
  ]],
  ['Ficus', [
    ['trasplante',3,1,4,2,0,''],
    ['abonado',4,1,9,1,30,''],
    ['reposo',12,1,2,2,0,''],
  ]],
];

const TABLAS = ['zonas','taxones','agentes','productos','plantas','episodios','eventos','tareas','media'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
               'septiembre','octubre','noviembre','diciembre'];

/* ── utilidades de fecha: se trabaja en 'YYYY-MM-DD' local, nunca en UTC ── */
const hoyISO = () => aISO(new Date());
function aISO(d){
  const p = n => String(n).padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}
function sumarDias(iso, n){
  const [a,m,d] = iso.split('-').map(Number);
  const f = new Date(a, m-1, d + n);
  return aISO(f);
}
function difDias(desde, hasta){
  const [a1,m1,d1] = desde.split('-').map(Number);
  const [a2,m2,d2] = hasta.split('-').map(Number);
  return Math.round((Date.UTC(a2,m2-1,d2) - Date.UTC(a1,m1-1,d1)) / 86400000);
}
function fechaCorta(iso){
  const [a,m,d] = iso.split('-').map(Number);
  const hoy = hoyISO();
  if (iso === hoy) return 'hoy';
  if (iso === sumarDias(hoy,-1)) return 'ayer';
  const mismoAno = String(a) === hoy.slice(0,4);
  return d + ' ' + MESES[m-1].slice(0,3) + (mismoAno ? '' : ' ' + a);
}
const ahora = () => new Date().toISOString();
const uid = () => (Date.now().toString(36) + Math.random().toString(36).slice(2,9));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ═══════════════════════════════════════════════════════════════════
   DB — IndexedDB directa. Los nueve stores desde la versión 1, aunque
   cuatro queden vacíos en Fase 1 (evita migrar dentro de dos meses).
   ═══════════════════════════════════════════════════════════════════ */

let db = null;

function pedir(r){
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function abrirDB(){
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NOMBRE, DB_VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      const tx = r.transaction;              // la transacción versionchange vive en la petición, no en la BD
      const crear = (n, opciones) => d.objectStoreNames.contains(n)
        ? tx.objectStore(n)
        : d.createObjectStore(n, opciones || { keyPath:'id' });
      TABLAS.forEach(t => crear(t));
      /* Los blobs van con clave fuera de línea: un Blob no tiene `id` dentro.
         En la v1 se creó con keyPath y estaba vacío, así que se rehace. */
      if (d.objectStoreNames.contains('media_blobs') && tx.objectStore('media_blobs').keyPath)
        d.deleteObjectStore('media_blobs');
      if (!d.objectStoreNames.contains('media_blobs')) d.createObjectStore('media_blobs');
      if (!d.objectStoreNames.contains('media_thumbs')) d.createObjectStore('media_thumbs');
      crear('meta', { keyPath:'k' });       // estado local: no viaja en el zip

      const plantas = tx.objectStore('plantas');
      if (!plantas.indexNames.contains('por_zona')) plantas.createIndex('por_zona','zona_id');

      const ev = tx.objectStore('eventos');
      // keyPath anidado: IndexedDB lo admite y evita duplicar el alcance en campos planos
      if (!ev.indexNames.contains('por_alcance_fecha')) ev.createIndex('por_alcance_fecha', ['alcance.id','fecha']);
      if (!ev.indexNames.contains('por_fecha'))         ev.createIndex('por_fecha','fecha');
      if (!ev.indexNames.contains('por_tipo_fecha'))    ev.createIndex('por_tipo_fecha', ['payload.tipo','fecha']);
      if (!ev.indexNames.contains('por_lote'))          ev.createIndex('por_lote','lote_id');
      if (!ev.indexNames.contains('por_episodio'))      ev.createIndex('por_episodio','episodio_id');

      const tareas = tx.objectStore('tareas');
      if (!tareas.indexNames.contains('por_fecha')) tareas.createIndex('por_fecha','fecha_prevista');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

const leerTodo  = n => pedir(db.transaction(n,'readonly').objectStore(n).getAll());
const guardar   = (n,v) => pedir(db.transaction(n,'readwrite').objectStore(n).put(v));
const borrar    = (n,k) => pedir(db.transaction(n,'readwrite').objectStore(n).delete(k));
const vaciar    = n => pedir(db.transaction(n,'readwrite').objectStore(n).clear());
const guardarClave = (n,k,v) => pedir(db.transaction(n,'readwrite').objectStore(n).put(v,k));
const leerClave    = (n,k) => pedir(db.transaction(n,'readonly').objectStore(n).get(k));
function guardarVarios(n, arr){
  return new Promise((res, rej) => {
    const t = db.transaction(n,'readwrite');
    const s = t.objectStore(n);
    arr.forEach(v => s.put(v));
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
}

/* ═══════════════════════════════════════════════════════════════════
   REPO — el conjunto de datos es pequeño: se mantiene en memoria y se
   escribe siempre a IndexedDB (write-through). Render sin await.
   ═══════════════════════════════════════════════════════════════════ */

const estado = { zonas:[], plantas:[], eventos:[], taxones:[], tareas:[],
                 agentes:[], productos:[], episodios:[], media:[], meta:{} };
let ctx = null;                 // índices del motor, recalculados al escribir

async function cargarEstado(){
  const [zonas, plantas, eventos, taxones, tareas, agentes, productos, episodios, media, meta] =
    await Promise.all(['zonas','plantas','eventos','taxones','tareas',
                       'agentes','productos','episodios','media','meta'].map(leerTodo));
  estado.zonas = zonas;
  estado.plantas = plantas;
  estado.eventos = eventos;
  estado.taxones = taxones;
  estado.tareas = tareas;
  estado.agentes = agentes;
  estado.productos = productos;
  estado.episodios = episodios;
  estado.media = media;
  estado.meta = Object.fromEntries(meta.map(m => [m.k, m.v]));
  urlsMedia.forEach(u => URL.revokeObjectURL(u));
  urlsMedia.clear();
  reindexar();
}
async function ponerMeta(k, v){
  estado.meta[k] = v;
  await guardar('meta', { k, v });
}

const zonaDe = p => estado.zonas.find(z => z.id === p.zona_id) || null;
const plantaPorId = id => estado.plantas.find(p => p.id === id) || null;

async function nuevaZona(datos){
  const z = { id: uid(), nombre: datos.nombre, exposicion: datos.exposicion, nota: datos.nota || '' };
  estado.zonas.push(z);
  await guardar('zonas', z);
  return z;
}
async function editarZona(z){
  const i = estado.zonas.findIndex(x => x.id === z.id);
  estado.zonas[i] = z;
  await guardar('zonas', z);
}
async function nuevaPlanta(d){
  const p = {
    id: uid(), nombre: d.nombre, taxon_id: d.taxon_id || null, especie: d.especie || '',
    zona_id: d.zona_id, perfil_hidrico: d.perfil_hidrico,
    litros: d.litros ?? null, sustrato: d.sustrato || '',
    comestible: !!d.comestible,
    intervalo_calido_dias: d.intervalo_calido_dias,
    intervalo_frio_dias: d.intervalo_frio_dias,
    mes_corte_calido: d.mes_corte_calido,
    activa: true, fecha_alta: ahora(),
  };
  estado.plantas.push(p);
  await guardar('plantas', p);
  reindexar();
  return p;
}
async function guardarPlanta(p){
  const i = estado.plantas.findIndex(x => x.id === p.id);
  if (i >= 0) estado.plantas[i] = p; else estado.plantas.push(p);
  await guardar('plantas', p);
  reindexar();
}

const taxonPorId = id => estado.taxones.find(t => t.id === id) || null;
const taxonDe = p => (p && p.taxon_id) ? taxonPorId(p.taxon_id) : null;

async function guardarTaxon(t){
  const i = estado.taxones.findIndex(x => x.id === t.id);
  if (i >= 0) estado.taxones[i] = t; else estado.taxones.push(t);
  await guardar('taxones', t);
}
async function borrarTaxon(id){
  estado.taxones = estado.taxones.filter(t => t.id !== id);
  await borrar('taxones', id);
}

async function nuevaTarea({ texto, fecha_prevista, alcance, clase, episodio_id }){
  const t = {
    id: uid(), alcance, fecha_prevista, clase: clase || 'libre',
    episodio_id: episodio_id || null, texto, hecha_evento_id: null, descartada: false,
  };
  estado.tareas.push(t);
  await guardar('tareas', t);
  return t;
}
async function guardarTarea(t){
  const i = estado.tareas.findIndex(x => x.id === t.id);
  if (i >= 0) estado.tareas[i] = t; else estado.tareas.push(t);
  await guardar('tareas', t);
}

/* Un evento nunca duplica propiedades de la planta: tipo, fecha, cuánto y nota. */
const agentePorId   = id => estado.agentes.find(a => a.id === id) || null;
const productoPorId = id => estado.productos.find(p => p.id === id) || null;
const episodioPorId = id => estado.episodios.find(e => e.id === id) || null;
const mediaPorId    = id => estado.media.find(m => m.id === id) || null;

async function guardarAgente(a){
  const i = estado.agentes.findIndex(x => x.id === a.id);
  if (i >= 0) estado.agentes[i] = a; else estado.agentes.push(a);
  await guardar('agentes', a);
}
async function guardarProducto(p){
  const i = estado.productos.findIndex(x => x.id === p.id);
  if (i >= 0) estado.productos[i] = p; else estado.productos.push(p);
  await guardar('productos', p);
}
async function borrarProducto(id){
  estado.productos = estado.productos.filter(p => p.id !== id);
  await borrar('productos', id);
}
async function guardarEpisodio(ep){
  const i = estado.episodios.findIndex(x => x.id === ep.id);
  if (i >= 0) estado.episodios[i] = ep; else estado.episodios.push(ep);
  await guardar('episodios', ep);
}

async function nuevoEvento({ fecha, alcance, payload, nota, lote_id, episodio_id, media_ids }){
  const e = {
    id: uid(),
    fecha: fecha || hoyISO(),
    creado_en: ahora(),            // inmutable
    alcance,
    lote_id: lote_id || null,
    episodio_id: episodio_id || null,
    media_ids: media_ids || [],
    nota: nota || '',
    payload,
  };
  estado.eventos.push(e);
  await guardar('eventos', e);
  await aplicarMutacion(e);
  reindexar();
  return e;
}
async function editarEvento(e){
  const i = estado.eventos.findIndex(x => x.id === e.id);
  estado.eventos[i] = e;
  await guardar('eventos', e);
  reindexar();
}
async function borrarEvento(id){
  estado.eventos = estado.eventos.filter(e => e.id !== id);
  await borrar('eventos', id);
  reindexar();
}

/* `trasplante` y `baja` son el único punto donde el log escribe sobre el sujeto. */
async function aplicarMutacion(e){
  if (e.alcance.tipo !== 'planta') return;
  const p = plantaPorId(e.alcance.id);
  if (!p) return;
  if (e.payload.tipo === 'trasplante'){
    if (e.payload.perfil_nuevo)  p.perfil_hidrico = e.payload.perfil_nuevo;
    if (e.payload.litros_nuevo != null) p.litros = e.payload.litros_nuevo;
    if (e.payload.sustrato_nuevo) p.sustrato = e.payload.sustrato_nuevo;
    await guardarPlanta(p);
  }
  if (e.payload.tipo === 'baja'){ p.activa = false; await guardarPlanta(p); }
}

/* ═══════════════════════════════════════════════════════════════════
   MOTOR — sistema de créditos. La unidad es el día, no el litro.
   ═══════════════════════════════════════════════════════════════════ */

function reindexar(){
  const riego = new Map();      // planta_id -> última fecha de riego
  const siembra = new Map();
  const lluvia = { global:new Map(), zona:new Map(), planta:new Map() };

  const mayor = (mapa, k, f) => { if (!mapa.has(k) || mapa.get(k) < f) mapa.set(k, f); };
  const mm = (mapa, k, fecha, v) => {
    if (!mapa.has(k)) mapa.set(k, new Map());
    const m = mapa.get(k);
    m.set(fecha, Math.max(m.get(fecha) || 0, v));   // dos lluvias el mismo día no se suman
  };

  for (const e of estado.eventos){
    const t = e.payload.tipo;
    if (t === 'lluvia'){
      const v = Number(e.payload.mm) || 0;
      if (e.alcance.tipo === 'global') lluvia.global.set(e.fecha, Math.max(lluvia.global.get(e.fecha)||0, v));
      else mm(lluvia[e.alcance.tipo], e.alcance.id, e.fecha, v);
      continue;
    }
    if (t !== 'riego' && t !== 'siembra') continue;
    const destino = t === 'riego' ? riego : siembra;
    const objetivo =
      e.alcance.tipo === 'planta' ? [e.alcance.id]
      : e.alcance.tipo === 'zona' ? estado.plantas.filter(p => p.zona_id === e.alcance.id).map(p => p.id)
      : estado.plantas.map(p => p.id);
    objetivo.forEach(id => mayor(destino, id, e.fecha));
  }
  ctx = { riego, siembra, lluvia };
}

function lluviaDe(planta, fecha){
  const g = ctx.lluvia.global.get(fecha) || 0;
  const z = (ctx.lluvia.zona.get(planta.zona_id) || new Map()).get(fecha) || 0;
  const p = (ctx.lluvia.planta.get(planta.id) || new Map()).get(fecha) || 0;
  return Math.max(g, z, p);
}

function esEpocaCalida(fecha, planta){
  const mes = Number(fecha.slice(5,7));
  const inicio = planta.mes_corte_calido;
  for (let i = 0; i < 6; i++) if (((inicio - 1 + i) % 12) + 1 === mes) return true;
  return false;
}

function intervaloDe(planta, fecha){
  return esEpocaCalida(fecha, planta) ? planta.intervalo_calido_dias : planta.intervalo_frio_dias;
}

function anclaDe(planta){
  return ctx.riego.get(planta.id)
      || ctx.siembra.get(planta.id)
      || planta.fecha_alta.slice(0,10);
}

/* Saldo en días. ≤ 0 → la planta entra en Hoy. */
function saldoDias(planta, zona, hoy){
  const intervalo = intervaloDe(planta, hoy);
  const perfil = PERFILES[planta.perfil_hidrico] || PERFILES.maceta_grande;
  const expuesta = zona ? zona.exposicion !== 'interior' : false;
  const techo = intervalo + perfil.techo_dias;

  let ancla = anclaDe(planta);
  const limite = sumarDias(hoy, -MAX_DIAS_MOTOR);
  if (ancla < limite) ancla = limite;               // el bucle no crece sin fin

  let saldo = intervalo;
  for (let d = sumarDias(ancla, 1); d <= hoy; d = sumarDias(d, 1)){
    saldo -= 1;
    if (expuesta){
      const mm = lluviaDe(planta, d);
      if (mm > 0) saldo += Math.min(mm / perfil.mm_riego_completo, 1) * intervalo;  // una lluvia ≤ un riego
    }
    saldo = Math.min(saldo, techo);                 // el crédito caduca: por eso el bucle es día a día
  }
  return { saldo, intervalo, techo, ancla, expuesta };
}
/* MOTOR_FIN */

/* ═══════════════════════════════════════════════════════════════════
   FENOLOGÍA — las ventanas no se almacenan: se derivan del log, igual
   que los riegos. Cero filas de Tarea, cero duplicados.
   ═══════════════════════════════════════════════════════════════════ */

/* FENO_INICIO */
/* Todo se compara en índices de quincena 0..23 (2 por mes). Nadie compara
   meses a mano fuera de estas cuatro funciones: ahí es donde falla siempre. */
const qDesde  = v => (v.desde.mes - 1) * 2 + (v.desde.quincena === 2 ? 1 : 0);
const qHasta  = v => (v.hasta.mes - 1) * 2 + (v.hasta.quincena === 1 ? 0 : 1);
const qDeFecha = f => (Number(f.slice(5,7)) - 1) * 2 + (Number(f.slice(8,10)) >= 16 ? 1 : 0);

function ventanaContiene(v, fecha){
  const q = qDeFecha(fecha), a = qDesde(v), b = qHasta(v);
  return a <= b ? (q >= a && q <= b) : (q >= a || q <= b);   // a > b ⇒ envuelve el cambio de año
}
function qDentro(a, b, i){ return a <= b ? (i >= a && i <= b) : (i >= a || i <= b); }

const finDeMes = (ano, mes) => new Date(ano, mes, 0).getDate();
const fechaDe = (a, m, d) => a + '-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0');

/* La temporada de una ventana que envuelve NO es el año natural: la poda de
   noviembre a febrero es una sola temporada, y el evento de enero la cierra. */
function rangoTemporada(v, fecha){
  const a = qDesde(v), b = qHasta(v), q = qDeFecha(fecha);
  let anoIni = Number(fecha.slice(0,4));
  if (a > b && q <= b) anoIni -= 1;
  const anoFin = a <= b ? anoIni : anoIni + 1;
  const mesA = Math.floor(a / 2) + 1, diaA = (a % 2 === 0) ? 1 : 16;
  const mesB = Math.floor(b / 2) + 1, diaB = (b % 2 === 0) ? 15 : finDeMes(anoFin, mesB);
  return { inicio: fechaDe(anoIni, mesA, diaA), fin: fechaDe(anoFin, mesB, diaB) };
}

function textoVentana(v){
  const nom = m => MESES[m - 1];
  const dq = v.desde.quincena, hq = v.hasta.quincena;
  const dTrivial = !dq || dq === 1;      // empezar en la 1ª quincena = empezar el mes
  const hTrivial = !hq || hq === 2;      // acabar en la 2ª = acabar el mes
  let txt;
  if (v.desde.mes === v.hasta.mes && dTrivial && hTrivial) txt = nom(v.desde.mes);
  else if (v.desde.mes === v.hasta.mes && dq === hq) txt = (dq === 1 ? '1ª' : '2ª') + ' quincena de ' + nom(v.desde.mes);
  else txt = (dTrivial ? nom(v.desde.mes) : '2ª quincena de ' + nom(v.desde.mes)) + ' → ' +
             (hTrivial ? nom(v.hasta.mes) : '1ª quincena de ' + nom(v.hasta.mes));
  return txt + (v.repetible && v.repetible.cada_dias ? ' · cada ' + v.repetible.cada_dias + ' d' : '');
}

/* Pendiente = hoy cae dentro de la ventana y no hay evento de esa clase en el
   log dentro de la temporada. Con `repetible`, reabre cada_dias después. */
function ventanasPendientes(planta, hoy){
  const t = taxonDe(planta);
  if (!t) return [];
  const salida = [];
  for (const v of (t.ventanas || [])){
    const meta = CLASES_VENTANA[v.clase];
    if (!meta || !meta.prescriptiva || !meta.evento) continue;
    if (!ventanaContiene(v, hoy)) continue;
    const temp = rangoTemporada(v, hoy);
    const hechos = estado.eventos
      .filter(e => e.alcance.tipo === 'planta' && e.alcance.id === planta.id &&
                   e.payload.tipo === meta.evento && e.fecha >= temp.inicio && e.fecha <= hoy)
      .map(e => e.fecha).sort();
    const ultimo = hechos.length ? hechos[hechos.length - 1] : null;
    const cada = v.repetible && v.repetible.cada_dias ? v.repetible.cada_dias : 0;

    let pendiente, desde;
    if (cada){
      pendiente = !ultimo || difDias(ultimo, hoy) >= cada;
      desde = ultimo ? sumarDias(ultimo, cada) : temp.inicio;
    } else {
      pendiente = !ultimo;
      desde = temp.inicio;
    }
    if (!pendiente) continue;
    const dias = Math.max(0, difDias(desde, hoy));
    salida.push({ taxon:t, ventana:v, meta, temporada:temp, dias, silenciada: dias > DIAS_SILENCIO });
  }
  return salida;
}

/* Agrupado por taxón + clase, no por planta: "Podar tomates (4)". */
function gruposTemporada(hoy){
  const mapa = new Map();
  for (const p of estado.plantas){
    if (!p.activa) continue;
    for (const w of ventanasPendientes(p, hoy)){
      const k = w.taxon.id + '|' + w.ventana.clase + '|' + w.ventana.desde.mes;
      if (!mapa.has(k))
        mapa.set(k, { clave:k, taxon:w.taxon, ventana:w.ventana, meta:w.meta,
                      dias:w.dias, silenciada:w.silenciada, plantas:[] });
      const g = mapa.get(k);
      g.plantas.push(p);
      g.dias = Math.min(g.dias, w.dias);
      g.silenciada = g.silenciada && w.silenciada;
    }
  }
  return [...mapa.values()].sort((a,b) =>
    (a.silenciada === b.silenciada ? 0 : a.silenciada ? 1 : -1) || a.dias - b.dias);
}

/* Banda anual: qué clases de ventana tiene abierto el jardín en cada quincena. */
function bandaAnual(){
  const usados = new Set(estado.plantas.filter(p => p.activa && p.taxon_id).map(p => p.taxon_id));
  const filas = new Map();
  for (const t of estado.taxones){
    if (!usados.has(t.id)) continue;
    for (const v of (t.ventanas || [])){
      if (!CLASES_VENTANA[v.clase]) continue;
      if (!filas.has(v.clase)) filas.set(v.clase, new Set());
      const s = filas.get(v.clase), a = qDesde(v), b = qHasta(v);
      for (let i = 0; i < 24; i++) if (qDentro(a, b, i)) s.add(i);
    }
  }
  return filas;
}

function tareasPendientes(hasta){
  return estado.tareas
    .filter(t => !t.hecha_evento_id && !t.descartada && t.fecha_prevista <= hasta)
    .sort((a,b) => a.fecha_prevista.localeCompare(b.fecha_prevista));
}
/* FENO_FIN */

function estadoDe(saldo){
  if (saldo <= -1) return 'deuda';
  if (saldo <= 1)  return 'justo';
  return 'bien';
}

function calcularHoy(fecha){
  return estado.plantas
    .filter(p => p.activa)
    .map(p => {
      const zona = zonaDe(p);
      const r = saldoDias(p, zona, fecha);
      return { planta:p, zona, ...r };
    })
    .sort((a,b) => a.saldo - b.saldo || a.planta.nombre.localeCompare(b.planta.nombre,'es'));
}

/* ═══════════════════════════════════════════════════════════════════
   ZIP — escritor y lector propios. STORE por defecto; deflate-raw
   nativo solo para el JSON. Sin librerías.
   ═══════════════════════════════════════════════════════════════════ */

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++){
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8){
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = TABLA_CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
const u16 = n => [n & 255, (n >>> 8) & 255];
const u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

function selloDOS(d){
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    fecha: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}
async function pasarPor(stream, datos){
  const r = new Response(new Blob([datos]).stream().pipeThrough(stream));
  return new Uint8Array(await r.arrayBuffer());
}

/* Con fotos, el pico de memoria es el problema: se calcula el CRC leyendo
   el blob por trozos y el Blob se pasa tal cual a la lista de partes, sin
   materializar los bytes. El pico se queda en una foto, no en el backup. */
async function crc32Blob(blob){
  let c = 0xFFFFFFFF;
  const lector = blob.stream().getReader();
  for (;;){
    const { done, value } = await lector.read();
    if (done) break;
    for (let i = 0; i < value.length; i++) c = TABLA_CRC[(c ^ value[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

async function escribirZip(entradas){
  const enc = new TextEncoder();
  const sello = selloDOS(new Date());
  const trozos = [], central = [];
  let offset = 0;

  for (const e of entradas){
    const nombre = enc.encode(e.nombre);
    let metodo = 0, cuerpo, crc, tamOriginal, tamComprimido;

    if (e.blob){                       // foto: STORE, ya es WebP; comprimir otra vez solo gasta CPU
      crc = await crc32Blob(e.blob);
      cuerpo = e.blob;
      tamOriginal = tamComprimido = e.blob.size;
    } else {
      const datos = e.datos || new Uint8Array(0);
      crc = crc32(datos);
      cuerpo = datos;
      tamOriginal = tamComprimido = datos.length;
      if (e.comprimir && typeof CompressionStream !== 'undefined' && datos.length > 256){
        try {
          const c = await pasarPor(new CompressionStream('deflate-raw'), datos);
          if (c.length < datos.length){ metodo = 8; cuerpo = c; tamComprimido = c.length; }
        } catch (_) { /* sin compresión: STORE sirve igual */ }
      }
    }

    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(metodo),
      ...u16(sello.hora), ...u16(sello.fecha),
      ...u32(crc), ...u32(tamComprimido), ...u32(tamOriginal),
      ...u16(nombre.length), ...u16(0),
    ];
    trozos.push(new Uint8Array(local), nombre, cuerpo);
    central.push([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(metodo),
      ...u16(sello.hora), ...u16(sello.fecha),
      ...u32(crc), ...u32(tamComprimido), ...u32(tamOriginal),
      ...u16(nombre.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(e.nombre.endsWith('/') ? 0x10 : 0), ...u32(offset),
      ...Array.from(nombre),
    ]);
    offset += local.length + nombre.length + tamComprimido;
  }

  const dir = [].concat(...central);
  const fin = [
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(central.length), ...u16(central.length),
    ...u32(dir.length), ...u32(offset), ...u16(0),
  ];
  return new Blob([...trozos, new Uint8Array(dir), new Uint8Array(fin)], { type:'application/zip' });
}

async function leerZip(buffer){
  const dv = new DataView(buffer), u8 = new Uint8Array(buffer);
  let p = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--){
    if (dv.getUint32(i, true) === 0x06054b50){ p = i; break; }
  }
  if (p < 0) throw new Error('No parece un zip: falta el registro final.');
  const total = dv.getUint16(p + 10, true);
  let off = dv.getUint32(p + 16, true);
  const dec = new TextDecoder();
  const salida = new Map();

  for (let i = 0; i < total; i++){
    if (dv.getUint32(off, true) !== 0x02014b50) throw new Error('Directorio del zip corrupto.');
    const metodo = dv.getUint16(off + 10, true);
    const crc    = dv.getUint32(off + 16, true);
    const comp   = dv.getUint32(off + 20, true);
    const nlen   = dv.getUint16(off + 28, true);
    const elen   = dv.getUint16(off + 30, true);
    const clen   = dv.getUint16(off + 32, true);
    const lho    = dv.getUint32(off + 42, true);
    const nombre = dec.decode(u8.slice(off + 46, off + 46 + nlen));
    off += 46 + nlen + elen + clen;
    if (nombre.endsWith('/')) continue;

    const nlen2 = dv.getUint16(lho + 26, true);
    const elen2 = dv.getUint16(lho + 28, true);
    const ini = lho + 30 + nlen2 + elen2;
    let datos = u8.slice(ini, ini + comp);
    if (metodo === 8){
      if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no sabe descomprimir el zip.');
      datos = await pasarPor(new DecompressionStream('deflate-raw'), datos);
    } else if (metodo !== 0){
      throw new Error('Compresión no soportada en ' + nombre);
    }
    if (crc32(datos) !== crc) throw new Error('Fichero dañado dentro del zip: ' + nombre);
    salida.set(nombre, datos);
  }
  return salida;
}

/* ═══════════════════════════════════════════════════════════════════
   BACKUP — el zip no tiene destino: se entrega y ya. Import desde el
   primer día: sin importación el zip no es un backup, es un fichero.
   ═══════════════════════════════════════════════════════════════════ */

async function exportar(opciones){
  const modo = (opciones && opciones.modo) || 'datos';
  const desde = opciones && opciones.desde, hasta = opciones && opciones.hasta;
  const enc = new TextEncoder();
  const datos = {};
  for (const t of TABLAS) datos[t] = await leerTodo(t);

  if (modo === 'rango'){
    datos.eventos = datos.eventos.filter(e => e.fecha >= desde && e.fecha <= hasta);
    const vivas = new Set(datos.eventos.flatMap(e => e.media_ids || []));
    datos.media = datos.media.filter(m => vivas.has(m.id));
    const eps = new Set(datos.eventos.map(e => e.episodio_id).filter(Boolean));
    datos.episodios = datos.episodios.filter(x => eps.has(x.id));
    datos.tareas = datos.tareas.filter(t => t.fecha_prevista >= desde && t.fecha_prevista <= hasta);
  }

  const fotos = modo === 'datos' ? [] : datos.media;
  const manifest = {
    app: APP,
    esquema: ESQUEMA,
    generado: ahora(),
    modo,
    rango: modo === 'rango' ? { desde, hasta } : null,
    fotos: fotos.length,
    registros: Object.fromEntries(TABLAS.map(t => [t, datos[t].length])),
  };

  const entradas = [
    { nombre:'manifest.json', datos: enc.encode(JSON.stringify(manifest, null, 2)), comprimir:true },
    { nombre:'data.json',     datos: enc.encode(JSON.stringify(datos)),             comprimir:true },
    { nombre:'media/',        datos: new Uint8Array(0) },
  ];
  for (const m of fotos){
    const blob = await leerClave('media_blobs', m.id);
    if (blob) entradas.push({ nombre:'media/' + m.id + '.webp', blob });
  }

  const zip = await escribirZip(entradas);
  const sufijo = modo === 'completo' ? '-completo' : modo === 'rango' ? '-' + desde + '_' + hasta : '';
  const nombre = 'jardin-' + hoyISO() + sufijo + '.zip';
  const fichero = new File([zip], nombre, { type:'application/zip' });
  let compartido = false;
  if (navigator.canShare && navigator.canShare({ files:[fichero] })){
    try { await navigator.share({ files:[fichero], title:nombre }); compartido = true; }
    catch (err) { if (err && err.name === 'AbortError') return null; }
  }
  if (!compartido){
    const url = URL.createObjectURL(zip);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  if (modo !== 'rango') await ponerMeta('ultima_exportacion', ahora());
  if (modo === 'completo') await ponerMeta('ultima_exportacion_completa', ahora());
  return { nombre, bytes: zip.size, fotos: fotos.length };
}

/* Un recordatorio que siempre exige 400 MB acaba ignorándose: se piden por
   separado el backup de datos, frecuente, y el completo, ocasional. */
async function pedirExportacion(){
  const hayFotos = estado.media.length;
  const d = await hoja({
    titulo:'Exportar',
    aceptar:'Exportar',
    campos:[
      { k:'modo', etiqueta:'Qué se lleva', tipo:'select', valor: hayFotos ? 'datos' : 'completo',
        opciones:[['datos','Solo datos · rápido'],
                  ['completo','Completo, con las ' + hayFotos + ' fotos'],
                  ['rango','Un periodo concreto']] },
      { k:'desde', etiqueta:'Desde (solo para periodo)', tipo:'fecha', valor: sumarDias(hoyISO(), -90) },
      { k:'hasta', etiqueta:'Hasta (solo para periodo)', tipo:'fecha', valor: hoyISO() },
    ],
    extra:'<p class="pie">Solo datos pesa kilobytes y sirve para el día a día. El completo incluye las fotos (' +
      tamano(bytesMedia()) + ') y es el que restaura de verdad.</p>',
  });
  if (!d) return null;
  return exportar({ modo:d.modo, desde:d.desde, hasta:d.hasta });
}

async function importar(file){
  const ficheros = await leerZip(await file.arrayBuffer());
  const dec = new TextDecoder();
  if (!ficheros.has('manifest.json') || !ficheros.has('data.json'))
    throw new Error('Al zip le falta manifest.json o data.json.');

  const manifest = JSON.parse(dec.decode(ficheros.get('manifest.json')));
  if (manifest.app !== APP) throw new Error('Ese zip es de otra aplicación.');
  if (manifest.esquema > ESQUEMA)
    throw new Error('El zip usa el esquema ' + manifest.esquema + ' y esta versión entiende hasta el ' + ESQUEMA + '.');

  const datos = JSON.parse(dec.decode(ficheros.get('data.json')));
  for (const t of TABLAS){
    if (!Array.isArray(datos[t] || [])) throw new Error('Tabla inválida en el zip: ' + t);
  }
  for (const t of TABLAS){
    await vaciar(t);
    if (datos[t] && datos[t].length) await guardarVarios(t, datos[t]);
  }

  /* Las miniaturas no viajan en el zip: se regeneran al importar. */
  const fotos = [...ficheros.keys()].filter(n => n.startsWith('media/') && !n.endsWith('/'));
  if (fotos.length){
    await vaciar('media_blobs');
    await vaciar('media_thumbs');
    for (const n of fotos){
      const id = n.slice(6).replace(/\.[^.]*$/, '');
      const blob = new Blob([ficheros.get(n)], { type:'image/webp' });
      await guardarClave('media_blobs', id, blob);
      try {
        const bmp = await createImageBitmap(blob);
        const mini = await aWebp(bmp, THUMB_LADO, THUMB_Q);
        if (bmp.close) bmp.close();
        await guardarClave('media_thumbs', id, mini.blob);
      } catch (_) { /* sin miniatura: la lista pedirá la grande */ }
    }
  }

  await cargarEstado();
  manifest.fotos_restauradas = fotos.length;
  return manifest;
}

function diasDesdeExportacion(){
  const u = estado.meta.ultima_exportacion;
  if (!u) return null;
  return difDias(u.slice(0,10), hoyISO());
}
function diasDesdeCompleta(){
  const u = estado.meta.ultima_exportacion_completa;
  if (!u) return null;
  return difDias(u.slice(0,10), hoyISO());
}

/* ═══════════════════════════════════════════════════════════════════
   UI — piezas comunes
   ═══════════════════════════════════════════════════════════════════ */

const $ = s => document.querySelector(s);
const capas = () => $('#capas');
let seleccion = new Set();
let seleccionManual = false;   // el usuario ya ha tocado la lista: no volver a preseleccionar
let fechaRegistro = hoyISO();
let ultimoLote = null;
let temporadaAbierta = false;
let grupoAbierto = null;
let mesBanda = null;
let cuotaActual = null;          // navigator.storage.estimate(), refrescado aparte del render

function icono(d){ return '<svg viewBox="0 0 24 24">' + d + '</svg>'; }
const ICONOS = {
  hoy:'<path d="M12 21c-4 0-7-3-7-7 0-5 7-11 7-11s7 6 7 11c0 4-3 7-7 7z"/><path d="M12 21V9"/>',
  plantas:'<path d="M4 20h16"/><path d="M12 20V8"/><path d="M12 12c-4 0-6-2-6-6 4 0 6 2 6 6z"/><path d="M12 14c4 0 6-2 6-6-4 0-6 2-6 6z"/>',
  agenda:'<path d="M4 6h16v14H4z"/><path d="M4 10h16"/><path d="M9 3v4M15 3v4"/><path d="M8 14h3"/>',
  ajustes:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  check:'<path d="M4 12l5 5L20 6"/>',
};

function pintarTabs(activa){
  const items = [['hoy','Hoy'],['plantas','Plantas'],['agenda','Agenda'],['ajustes','Ajustes']];
  $('#tabs').innerHTML = items.map(([id,txt]) =>
    '<a href="#/' + id + '" class="' + (activa === id ? 'on' : '') + '">' +
    icono(ICONOS[id]) + '<span>' + txt + '</span></a>').join('');
}

function toast(html, ms = 12000){
  const v = document.createElement('div');
  v.className = 'toast';
  v.innerHTML = html;
  capas().appendChild(v);
  const cerrar = () => v.remove();
  if (ms) setTimeout(cerrar, ms);
  return { el:v, cerrar };
}

function aviso(texto){ toast('<p>' + esc(texto) + '</p>', 4000); }

/* Formulario en hoja inferior. campos: {k,etiqueta,tipo,valor,opciones,ayuda} */
function hoja({ titulo, campos = [], aceptar = 'Guardar', extra = '' }){
  return new Promise(res => {
    const velo = document.createElement('div');
    velo.className = 'velo';
    const html = campos.map(c => {
      const id = 'c_' + c.k;
      if (c.tipo === 'check')
        return '<label class="check"><input type="checkbox" id="' + id + '"' + (c.valor ? ' checked' : '') +
               '><span>' + esc(c.etiqueta) + '</span></label>';
      const et = '<span>' + esc(c.etiqueta) + '</span>';
      if (c.tipo === 'select')
        return '<label class="campo">' + et + '<select id="' + id + '">' +
          c.opciones.map(([v,t]) => '<option value="' + esc(v) + '"' +
            (String(c.valor) === String(v) ? ' selected' : '') + '>' + esc(t) + '</option>').join('') +
          '</select></label>';
      if (c.tipo === 'textarea')
        return '<label class="campo">' + et + '<textarea id="' + id + '">' + esc(c.valor || '') + '</textarea></label>';
      const tipo = c.tipo === 'numero' ? 'number' : c.tipo === 'fecha' ? 'date' : 'text';
      const paso = c.paso ? ' step="' + c.paso + '"' : '';
      return '<label class="campo">' + et + '<input type="' + tipo + '" id="' + id + '"' + paso +
             ' value="' + esc(c.valor ?? '') + '"' + (c.ayuda ? ' placeholder="' + esc(c.ayuda) + '"' : '') + '></label>';
    }).join('');

    velo.innerHTML = '<div class="hoja"><h3>' + esc(titulo) + '</h3>' + html + extra +
      '<div class="fila-btns" style="margin-top:16px">' +
      '<button class="btn fantasma" data-x="no">Cancelar</button>' +
      '<button class="btn principal" data-x="si">' + esc(aceptar) + '</button></div></div>';
    capas().appendChild(velo);

    const leer = () => {
      const o = {};
      campos.forEach(c => {
        const el = velo.querySelector('#c_' + c.k);
        if (!el) return;
        o[c.k] = c.tipo === 'check' ? el.checked
               : c.tipo === 'numero' ? (el.value === '' ? null : Number(el.value))
               : el.value;
      });
      return o;
    };
    velo.addEventListener('click', ev => {
      if (ev.target === velo){ velo.remove(); res(null); return; }
      const x = ev.target.closest('[data-x]');
      if (!x) return;
      const datos = x.dataset.x === 'si' ? leer() : null;
      velo.remove();
      res(datos);
    });
    const primero = velo.querySelector('input,select,textarea');
    if (primero && primero.type !== 'date') primero.focus();
  });
}

function confirmar(texto, aceptar = 'Sí'){
  return new Promise(res => {
    const velo = document.createElement('div');
    velo.className = 'velo';
    velo.innerHTML = '<div class="hoja"><h3>' + esc(texto) + '</h3>' +
      '<div class="fila-btns"><button class="btn fantasma" data-x="no">Cancelar</button>' +
      '<button class="btn principal" data-x="si">' + esc(aceptar) + '</button></div></div>';
    capas().appendChild(velo);
    velo.addEventListener('click', ev => {
      if (ev.target === velo){ velo.remove(); res(false); return; }
      const x = ev.target.closest('[data-x]');
      if (!x) return;
      velo.remove(); res(x.dataset.x === 'si');
    });
  });
}

/* ── formularios concretos ── */

function camposPlanta(p){
  const zonas = estado.zonas.map(z => [z.id, z.nombre]);
  return [
    { k:'nombre', etiqueta:'Nombre', valor:p ? p.nombre : '', ayuda:'limonero del bancal 2' },
    { k:'taxon_id', etiqueta:'Taxón (aporta la fenología)', tipo:'select',
      opciones:[['','— sin taxón —']].concat(estado.taxones.slice()
        .sort((a,b) => a.nombre.localeCompare(b.nombre,'es')).map(t => [t.id, t.nombre])),
      valor:p ? (p.taxon_id || '') : '' },
    { k:'especie', etiqueta:'Especie (opcional)', valor:p ? p.especie : '' },
    { k:'zona_id', etiqueta:'Zona', tipo:'select', opciones:zonas, valor:p ? p.zona_id : (zonas[0] || [''])[0] },
    { k:'perfil_hidrico', etiqueta:'Perfil hídrico', tipo:'select',
      opciones:Object.entries(PERFILES).map(([k,v]) => [k, v.etiqueta]),
      valor:p ? p.perfil_hidrico : 'maceta_grande' },
    { k:'intervalo_calido_dias', etiqueta:'Riego en época cálida (días)', tipo:'numero',
      valor:p ? p.intervalo_calido_dias : 3 },
    { k:'intervalo_frio_dias', etiqueta:'Riego en época fría (días)', tipo:'numero',
      valor:p ? p.intervalo_frio_dias : 7 },
    { k:'mes_corte_calido', etiqueta:'La época cálida empieza en', tipo:'select',
      opciones:MESES.map((m,i) => [i+1, m[0].toUpperCase() + m.slice(1)]),
      valor:p ? p.mes_corte_calido : 5 },
    { k:'litros', etiqueta:'Litros (informativo)', tipo:'numero', valor:p ? p.litros : null },
    { k:'sustrato', etiqueta:'Sustrato (informativo)', valor:p ? p.sustrato : '' },
    { k:'comestible', etiqueta:'Se come', tipo:'check', valor:p ? p.comestible : false },
  ];
}

async function pedirPlanta(p){
  if (!estado.zonas.length){
    aviso('Antes de una planta hace falta una zona. Créala en Ajustes.');
    return null;
  }
  const d = await hoja({ titulo: p ? 'Editar planta' : 'Nueva planta', campos: camposPlanta(p) });
  if (!d) return null;
  if (!d.nombre.trim()){ aviso('La planta necesita un nombre.'); return null; }
  d.intervalo_calido_dias = Math.max(1, d.intervalo_calido_dias || 3);
  d.intervalo_frio_dias = Math.max(1, d.intervalo_frio_dias || 7);
  d.mes_corte_calido = Number(d.mes_corte_calido);
  d.taxon_id = d.taxon_id || null;
  if (p){
    await guardarPlanta(Object.assign({}, p, d));
    return p.id;
  }
  const nueva = await nuevaPlanta(d);
  return nueva.id;
}

async function pedirZona(z){
  const d = await hoja({
    titulo: z ? 'Editar zona' : 'Nueva zona',
    campos:[
      { k:'nombre', etiqueta:'Nombre', valor:z ? z.nombre : '', ayuda:'bancal 2, terraza, salón' },
      { k:'exposicion', etiqueta:'Exposición', tipo:'select',
        opciones:[['exterior','Exterior'],['interior','Interior'],['invernadero','Invernadero']],
        valor:z ? z.exposicion : 'exterior' },
      { k:'nota', etiqueta:'Nota', valor:z ? z.nota : '' },
    ],
  });
  if (!d || !d.nombre.trim()) return;
  if (z) await editarZona(Object.assign({}, z, d));
  else await nuevaZona(d);
  render();
}

/* ═══════════════════════════════════════════════════════════════════
   UI — pantalla Hoy: la entrada de datos. Un gesto, fecha implícita.
   ═══════════════════════════════════════════════════════════════════ */

function vistaHoy(){
  const filas = calcularHoy(fechaRegistro);
  const tocan = filas.filter(f => f.saldo <= 0);
  const resto = filas.filter(f => f.saldo > 0);

  if (!seleccionManual && !seleccion.size && tocan.length) tocan.forEach(f => seleccion.add(f.planta.id));

  const dias = diasDesdeExportacion();
  const cada = estado.meta.recordatorio_dias ?? 7;
  let cabecera = '';
  if (estado.plantas.length && (dias === null || dias >= cada)){
    cabecera = '<div class="aviso"><div class="crece">' +
      (dias === null ? 'Nunca has exportado. El zip es la única copia que existe.'
                     : 'Último zip hace ' + dias + ' días.') +
      '</div><button class="btn" data-a="exportar">Exportar</button></div>';
  }
  const completa = diasDesdeCompleta();
  if (estado.media.length && (completa === null || completa >= DIAS_BACKUP_COMPLETO)){
    cabecera += '<div class="aviso"><div class="crece">' +
      (completa === null
        ? 'Las ' + estado.media.length + ' fotos no están en ningún zip todavía (' + tamano(bytesMedia()) + ').'
        : 'El último backup con fotos es de hace ' + completa + ' días.') +
      '</div><button class="btn" data-a="exportar">Completo</button></div>';
  }
  if (cuotaActual && cuotaActual.fraccion >= AVISO_CUOTA){
    cabecera += '<div class="aviso rojo"><div class="crece">El almacenamiento va al ' +
      Math.round(cuotaActual.fraccion * 100) + '% (' + tamano(cuotaActual.usado) + ' de ' +
      tamano(cuotaActual.cupo) + '). Exporta y purga fotos antiguas.' +
      '</div><button class="btn" data-a="purgar">Purgar</button></div>';
  }

  if (!estado.plantas.length){
    return cabecera + '<section class="bloque"><div class="tarjeta">' +
      '<h3 style="margin-bottom:6px">Empieza por una zona</h3>' +
      '<p class="pie" style="margin:0 0 14px">Una zona es un sitio con la misma exposición: un bancal, la terraza, el salón. ' +
      'Después añade las plantas que viven en ella.</p>' +
      '<div class="fila-btns"><button class="btn" data-a="zona-nueva">Nueva zona</button>' +
      '<button class="btn principal" data-a="planta-nueva">Nueva planta</button></div></div></section>';
  }

  const bloque = (titulo, lista) => !lista.length ? '' :
    '<section class="bloque"><h2>' + titulo + '</h2><div class="lista">' +
    lista.map(filaPlanta).join('') + '</div></section>';

  return cabecera +
    bloque('Toca regar · ' + tocan.length, tocan) +
    vistaTareas() +
    vistaSanidadHoy() +
    vistaTemporada() +
    bloque('Con reserva · ' + resto.length, resto) +
    '<section class="bloque"><div class="fila-btns">' +
      '<button class="btn" data-a="lluvia">Ha llovido</button>' +
      '<button class="btn" data-a="tarea-nueva">Nueva tarea</button>' +
      '<button class="btn" data-a="planta-nueva">Nueva planta</button>' +
    '</div></section>';
}

function vistaTareas(){
  const ts = tareasPendientes(fechaRegistro);
  if (!ts.length) return '';
  const donde = a => a.tipo === 'global' ? 'todo el jardín'
    : a.tipo === 'zona' ? ((estado.zonas.find(z => z.id === a.id) || {nombre:'zona'}).nombre)
    : ((plantaPorId(a.id) || {nombre:'planta'}).nombre);
  return '<section class="bloque"><h2>Tareas · ' + ts.length + '</h2><div class="lista">' +
    ts.map(t => {
      const tarde = difDias(t.fecha_prevista, fechaRegistro);
      return '<div class="fila"><div class="toggle" style="cursor:default">' +
        '<span class="cuerpo"><span class="nombre">' + esc(t.texto) + '</span>' +
        '<span class="meta">' + esc(donde(t.alcance)) + ' · ' +
        (tarde > 0 ? 'hace ' + tarde + ' d' : fechaCorta(t.fecha_prevista)) + '</span></span></div>' +
        '<button class="abrir" data-a="tarea-hecha" data-id="' + t.id + '" aria-label="Hecha">✓</button>' +
        '<button class="abrir" data-a="tarea-fuera" data-id="' + t.id + '" aria-label="Descartar">✕</button>' +
      '</div>';
    }).join('') + '</div></section>';
}

/* Temporada: bloque aparte, colapsado y agrupado. Nunca compite con los riegos. */
function vistaTemporada(){
  const grupos = gruposTemporada(fechaRegistro);
  if (!grupos.length) return '';
  const nuevas = grupos.filter(g => !g.silenciada).length;
  const viejas = grupos.length - nuevas;
  const titulo = 'De temporada · ' + nuevas + (viejas ? ' <span class="pie">+' + viejas + ' antiguas</span>' : '');

  if (!temporadaAbierta)
    return '<section class="bloque"><button class="plegable" data-a="temporada">' +
      '<span class="crece">' + titulo + '</span><span class="flecha">▾</span></button></section>';

  return '<section class="bloque"><button class="plegable" data-a="temporada">' +
    '<span class="crece">' + titulo + '</span><span class="flecha abierta">▾</span></button>' +
    '<div class="lista" style="margin-top:8px">' + grupos.map(grupoTemporada).join('') + '</div></section>';
}

function grupoTemporada(g){
  const abierto = grupoAbierto === g.clave;
  const cab = '<button class="grupo-cab" data-a="grupo" data-k="' + esc(g.clave) + '">' +
    '<span class="punto" style="background:' + g.meta.color + '"></span>' +
    '<span class="crece"><span class="nombre">' + esc(g.meta.verbo + ' ' + g.taxon.nombre.toLowerCase()) +
    ' (' + g.plantas.length + ')</span>' +
    '<span class="meta">' + esc(textoVentana(g.ventana)) +
    (g.dias > 0 ? ' · abierta hace ' + g.dias + ' d' : ' · desde hoy') + '</span></span>' +
    '<span class="flecha' + (abierto ? ' abierta' : '') + '">▾</span></button>';

  if (!abierto) return '<div class="grupo' + (g.silenciada ? ' apagado' : '') + '">' + cab + '</div>';

  const filas = g.plantas.map(p =>
    '<div class="dato"><span style="color:var(--texto)">' + esc(p.nombre) + '</span>' +
    '<button class="btn fantasma" style="min-height:34px;padding:4px 12px" data-a="temp-hecho" data-k="' +
    esc(g.clave) + '" data-id="' + p.id + '">Hecho</button></div>').join('');

  return '<div class="grupo' + (g.silenciada ? ' apagado' : '') + '">' + cab +
    '<div class="grupo-cuerpo">' + filas +
    (g.ventana.nota ? '<p class="pie" style="margin:8px 0 0">' + esc(g.ventana.nota) + '</p>' : '') +
    (g.plantas.length > 1 ? '<button class="btn ancho" style="margin-top:10px" data-a="temp-hecho" data-k="' +
      esc(g.clave) + '">' + esc(g.meta.verbo) + ' las ' + g.plantas.length + '</button>' : '') +
    '</div></div>';
}

function filaPlanta(f){
  const est = estadoDe(f.saldo);
  const sel = seleccion.has(f.planta.id);
  const n = Math.round(f.saldo);
  const ancho = f.saldo >= 0
    ? Math.min(f.saldo / f.techo, 1) * 50
    : Math.min(-f.saldo / f.intervalo, 1) * 50;
  const barra = f.saldo >= 0
    ? '<i class="' + (est === 'justo' ? 'justo' : '') + '" style="left:50%;width:' + ancho + '%"></i>'
    : '<i class="deuda" style="right:50%;width:' + ancho + '%"></i>';
  const zona = f.zona ? f.zona.nombre : 'sin zona';
  const ultimo = ctx.riego.get(f.planta.id);
  const meta = zona + ' · ' + (ultimo ? 'regada ' + fechaCorta(ultimo) : 'sin riegos aún');

  return '<div class="fila' + (sel ? ' sel' : '') + '">' +
    '<button class="toggle" data-a="marcar" data-id="' + f.planta.id + '" aria-pressed="' + sel + '">' +
      '<span class="marca">' + icono(ICONOS.check) + '</span>' +
      '<span class="cuerpo"><span class="nombre">' + esc(f.planta.nombre) + '</span>' +
      '<span class="meta">' + esc(meta) + '</span>' +
      '<span class="reserva">' + barra + '</span></span>' +
      '<span class="dias ' + est + '"><b>' + (n > 0 ? '+' + n : n) + '</b><small>días</small></span>' +
    '</button>' +
    '<button class="abrir" data-a="ficha" data-id="' + f.planta.id + '" aria-label="Abrir ficha">›</button>' +
  '</div>';
}

function barraAccion(){
  if (!seleccion.size) return '';
  const retro = fechaRegistro !== hoyISO() ? ' · ' + fechaCorta(fechaRegistro) : '';
  return '<div class="accion"><button class="btn agua" data-a="regar">Regar ' +
    seleccion.size + (seleccion.size === 1 ? ' planta' : ' plantas') + retro +
    '</button><button class="btn fantasma" data-a="nada" style="flex:0 0 auto">Ninguna</button></div>';
}

async function registrarRiego(){
  const ids = [...seleccion];
  if (!ids.length) return;
  const lote = uid();
  for (const id of ids){
    await nuevoEvento({
      fecha: fechaRegistro,
      alcance: { tipo:'planta', id },
      payload: { tipo:'riego' },
      lote_id: lote,
    });
  }
  ultimoLote = { id:lote, plantas:ids };
  seleccion.clear();
  seleccionManual = false;
  render();
  toast('<p>Regadas ' + ids.length + (ids.length === 1 ? ' planta' : ' plantas') +
    (fechaRegistro !== hoyISO() ? ' con fecha ' + fechaCorta(fechaRegistro) : '') + '. ¿Cómo iba la tierra?</p>' +
    '<div class="chips">' +
      '<button class="chip" data-a="cal" data-v="seca">Iba seca</button>' +
      '<button class="chip" data-a="cal" data-v="justo">Justo</button>' +
      '<button class="chip" data-a="cal" data-v="pronto">Me he adelantado</button>' +
      '<button class="chip" data-a="deshacer">Deshacer</button>' +
    '</div>');
}

/* Calibración: ajusta solo el intervalo, nunca el perfil hídrico. */
async function calibrar(valor){
  if (!ultimoLote) return;
  if (valor !== 'justo'){
    const delta = valor === 'seca' ? -1 : 1;
    for (const id of ultimoLote.plantas){
      const p = plantaPorId(id);
      if (!p) continue;
      const calido = esEpocaCalida(fechaRegistro, p);
      const clave = calido ? 'intervalo_calido_dias' : 'intervalo_frio_dias';
      p[clave] = Math.min(60, Math.max(1, p[clave] + delta));
      await guardarPlanta(p);
    }
  }
  capas().innerHTML = '';
  render();
  if (valor !== 'justo') aviso(valor === 'seca' ? 'Se regará un día antes.' : 'Se regará un día después.');
}

async function deshacerLote(){
  if (!ultimoLote) return;
  const ids = estado.eventos.filter(e => e.lote_id === ultimoLote.id).map(e => e.id);
  for (const id of ids) await borrarEvento(id);
  ultimoLote = null;
  capas().innerHTML = '';
  render();
}

async function pedirLluvia(){
  const zonas = [['global','Todo el jardín']].concat(estado.zonas.map(z => [z.id, z.nombre]));
  const d = await hoja({
    titulo:'Ha llovido',
    aceptar:'Registrar',
    campos:[
      { k:'mm', etiqueta:'Milímetros', tipo:'numero', valor:5 },
      { k:'donde', etiqueta:'Dónde', tipo:'select', opciones:zonas, valor:'global' },
      { k:'fecha', etiqueta:'Cuándo', tipo:'fecha', valor:fechaRegistro },
      { k:'nota', etiqueta:'Nota', valor:'' },
    ],
  });
  if (!d) return;
  const mm = Number(d.mm);
  if (!mm || mm <= 0){ aviso('Los milímetros tienen que ser mayores que cero.'); return; }
  await nuevoEvento({
    fecha: d.fecha,
    alcance: d.donde === 'global' ? { tipo:'global' } : { tipo:'zona', id:d.donde },
    payload: { tipo:'lluvia', mm },
    nota: d.nota,
  });
  render();
}

/* ═══════════════════════════════════════════════════════════════════
   UI — plantas, ficha e histórico
   ═══════════════════════════════════════════════════════════════════ */

function vistaPlantas(){
  if (!estado.plantas.length)
    return '<div class="vacio">Todavía no hay plantas.</div>' +
      '<button class="btn principal ancho" data-a="planta-nueva">Nueva planta</button>';

  const activas = estado.plantas.filter(p => p.activa);
  const bajas = estado.plantas.filter(p => !p.activa);
  const porZona = estado.zonas.map(z => [z, activas.filter(p => p.zona_id === z.id)])
    .filter(([, ps]) => ps.length);
  const huerfanas = activas.filter(p => !zonaDe(p));

  const grupo = (titulo, ps) => '<section class="bloque"><h2>' + esc(titulo) + '</h2><div class="lista">' +
    ps.map(p => {
      const r = saldoDias(p, zonaDe(p), hoyISO());
      const est = estadoDe(r.saldo);
      const n = Math.round(r.saldo);
      return '<div class="fila"><button class="toggle" data-a="ficha" data-id="' + p.id + '">' +
        '<span class="cuerpo"><span class="nombre">' + esc(p.nombre) + '</span>' +
        '<span class="meta">' + esc(PERFILES[p.perfil_hidrico].etiqueta.toLowerCase()) +
        ' · cada ' + r.intervalo + ' días' + (p.comestible ? ' · se come' : '') + '</span></span>' +
        '<span class="dias ' + est + '"><b>' + (n > 0 ? '+' + n : n) + '</b><small>días</small></span>' +
        '</button></div>';
    }).join('') + '</div></section>';

  return porZona.map(([z, ps]) => grupo(z.nombre + ' · ' + z.exposicion, ps)).join('') +
    (huerfanas.length ? grupo('Sin zona', huerfanas) : '') +
    (bajas.length ? '<section class="bloque"><h2>De baja · ' + bajas.length + '</h2><div class="lista">' +
      bajas.map(p => '<div class="fila"><button class="toggle" data-a="ficha" data-id="' + p.id + '">' +
        '<span class="cuerpo"><span class="nombre">' + esc(p.nombre) + '</span>' +
        '<span class="meta">dada de baja</span></span></button></div>').join('') +
      '</div></section>' : '') +
    '<button class="btn principal ancho" data-a="planta-nueva">Nueva planta</button>';
}

function eventosDe(planta){
  return estado.eventos.filter(e =>
    (e.alcance.tipo === 'planta' && e.alcance.id === planta.id) ||
    (e.alcance.tipo === 'zona' && e.alcance.id === planta.zona_id) ||
    (e.alcance.tipo === 'global')
  ).sort((a,b) => b.fecha.localeCompare(a.fecha) || b.creado_en.localeCompare(a.creado_en));
}

function textoEvento(e){
  const p = e.payload;
  switch (p.tipo){
    case 'riego':      return p.litros ? p.litros + ' L' : 'Regada';
    case 'lluvia':     return p.mm + ' mm' + (e.alcance.tipo === 'zona' ? ' (zona)' : ' (todo el jardín)');
    case 'siembra':    return 'Origen: ' + p.origen;
    case 'trasplante': return 'A ' + (PERFILES[p.perfil_nuevo] ? PERFILES[p.perfil_nuevo].etiqueta.toLowerCase() : 'otro sitio') +
                              (p.litros_nuevo ? ' · ' + p.litros_nuevo + ' L' : '') +
                              (p.sustrato_nuevo ? ' · ' + p.sustrato_nuevo : '');
    case 'poda':       return 'Poda ' + (p.clase || '') + (p.intensidad ? ' · ' + p.intensidad : '');
    case 'abonado': {
      const pr = productoPorId(p.producto_id);
      return (pr ? pr.nombre_comercial : 'Abonada') + (p.dosis ? ' · ' + p.dosis : '');
    }
    case 'cosecha':    return p.cantidad != null ? p.cantidad + ' ' + (p.unidad || '') : 'Cosecha';
    case 'baja':       return p.causa || 'Sin causa anotada';
    case 'observacion': {
      const ag = agentePorId(p.agente_id);
      return (ag ? ag.nombre : 'Síntoma') + ' · ' + SEVERIDAD[p.severidad];
    }
    case 'tratamiento': {
      const pr = productoPorId(p.producto_id);
      return (pr ? pr.nombre_comercial : 'Producto borrado') +
        (p.dosis_real ? ' · ' + p.dosis_real : '') +
        (p.metodo ? ' · ' + (METODOS[p.metodo] || p.metodo) : '') +
        (p.volumen_l ? ' · ' + p.volumen_l + ' L' : '');
    }
    default:           return '';
  }
}

function listaEventos(eventos, conAlcance, conFecha){
  if (!eventos.length) return '<div class="vacio">Sin eventos todavía.</div>';
  return eventos.map(e => {
    const donde = !conAlcance ? '' :
      e.alcance.tipo === 'planta' ? (plantaPorId(e.alcance.id) || {nombre:'planta borrada'}).nombre
      : e.alcance.tipo === 'zona' ? ((estado.zonas.find(z => z.id === e.alcance.id) || {nombre:'zona'}).nombre)
      : 'todo el jardín';
    return '<div class="evento">' +
      '<div class="tipo t-' + e.payload.tipo + '">' + (TIPOS_EVENTO[e.payload.tipo] || e.payload.tipo) + '</div>' +
      '<div class="txt"><div>' + esc(textoEvento(e) || e.nota || '—') + (conAlcance ? ' <span class="pie">· ' + esc(donde) + '</span>' : '') + '</div>' +
      (e.nota && textoEvento(e) ? '<div class="pie">' + esc(e.nota) + '</div>' : '') +
      (conFecha === false ? '' : '<div class="fecha">' + fechaCorta(e.fecha) + '</div>') +
      ((e.media_ids || []).length
        ? galeriaHTML(e.media_ids.filter(mediaPorId).slice(0,3).map(mid => ({ id:mid })), 56)
        : '') +
      '</div>' +
      '<button class="quitar" data-a="ev-foto" data-id="' + e.id + '" aria-label="Añadir foto">' +
        icono('<path d="M4 8h4l1.5-2h5L16 8h4v11H4z"/><circle cx="12" cy="13" r="3.2"/>') + '</button>' +
      '<button class="quitar" data-a="ev-fecha" data-id="' + e.id + '" aria-label="Cambiar la fecha">' +
        icono('<path d="M5 5h14v15H5z"/><path d="M5 10h14M9 3v4M15 3v4"/>') + '</button>' +
      '<button class="quitar" data-a="ev-borrar" data-id="' + e.id + '" aria-label="Borrar">✕</button>' +
    '</div>';
  }).join('');
}

function vistaFicha(id){
  const p = plantaPorId(id);
  if (!p) return '<div class="vacio">Esa planta ya no existe.</div>';
  const z = zonaDe(p);
  const r = saldoDias(p, z, hoyISO());
  const est = estadoDe(r.saldo);
  const n = Math.round(r.saldo);
  const ultimo = ctx.riego.get(p.id);

  return '<section class="bloque"><div class="tarjeta">' +
    '<div style="display:flex;align-items:center;gap:16px">' +
      '<div class="grande dias ' + est + '" style="min-width:0"><b style="font-size:2.4rem">' + (n > 0 ? '+' + n : n) + '</b></div>' +
      '<div><div class="pie">días de reserva</div>' +
      '<div class="pie">' + (ultimo ? 'último riego ' + fechaCorta(ultimo) : 'sin riegos registrados') + '</div></div>' +
    '</div>' +
    '<div class="fila-btns" style="margin-top:14px">' +
      '<button class="btn agua" data-a="regar-una" data-id="' + p.id + '">Regar hoy</button>' +
      '<button class="btn" data-a="nota" data-id="' + p.id + '">Anotar</button>' +
      '<button class="btn" data-a="evento-otro" data-id="' + p.id + '">Otro evento…</button>' +
    '</div></div></section>' +
    fichaTemporada(p) +

    '<section class="bloque"><h2>Ficha</h2><div class="tarjeta">' +
      dato('Zona', z ? z.nombre + ' · ' + z.exposicion : 'sin zona') +
      dato('Taxón', taxonDe(p) ? taxonDe(p).nombre : '—') +
      dato('Especie', p.especie || '—') +
      dato('Perfil hídrico', PERFILES[p.perfil_hidrico].etiqueta) +
      dato('Riego', 'cada ' + p.intervalo_calido_dias + ' d en cálido · cada ' + p.intervalo_frio_dias + ' d en frío') +
      dato('Época cálida', MESES[p.mes_corte_calido - 1] + ' → ' + MESES[(p.mes_corte_calido + 4) % 12]) +
      dato('Litros', p.litros ? p.litros + ' L' : '—') +
      dato('Sustrato', p.sustrato || '—') +
      dato('Se come', p.comestible ? 'sí' : 'no') +
      dato('Alta', fechaCorta(p.fecha_alta.slice(0,10))) +
    '</div>' +
    '<div class="fila-btns" style="margin-top:10px">' +
      '<button class="btn" data-a="planta-editar" data-id="' + p.id + '">Editar</button>' +
      '<button class="btn" data-a="trasplante" data-id="' + p.id + '">Trasplantar</button>' +
      '<button class="btn" data-a="siembra" data-id="' + p.id + '">Siembra</button>' +
    '</div>' +
    '<div class="fila-btns" style="margin-top:8px">' +
      '<button class="btn" data-a="tarea-nueva" data-id="' + p.id + '">Nueva tarea</button>' +
      (p.activa
        ? '<button class="btn peligro" data-a="baja" data-id="' + p.id + '">Dar de baja</button>'
        : '<button class="btn" data-a="revivir" data-id="' + p.id + '">Reactivar</button>') +
      '<button class="btn peligro" data-a="planta-borrar" data-id="' + p.id + '">Eliminar</button>' +
    '</div></section>' +

    fichaSanidad(p) +
    fichaFotos(p) +
    '<section class="bloque"><h2>Histórico</h2><div class="tarjeta">' +
      listaEventos(eventosDe(p), false) + '</div></section>';
}

function dato(k, v){
  return '<div class="dato"><span>' + esc(k) + '</span><span>' + esc(v) + '</span></div>';
}

function fichaTemporada(p){
  const t = taxonDe(p);
  if (!t) return '';
  const hoy = hoyISO();
  const pend = ventanasPendientes(p, hoy);
  const activas = (t.ventanas || []).filter(v => ventanaContiene(v, hoy));
  if (!activas.length && !pend.length) return '';
  const clave = v => t.id + '|' + v.clase + '|' + v.desde.mes;
  const esPendiente = v => pend.some(w => w.ventana === v);

  return '<section class="bloque"><h2>Temporada</h2><div class="tarjeta">' +
    activas.map(v => {
      const meta = CLASES_VENTANA[v.clase];
      return '<div class="dato"><span style="color:var(--texto)">' +
        '<span class="punto" style="background:' + meta.color + ';display:inline-block;margin-right:8px"></span>' +
        esc(meta.etiqueta) + '<br><span class="pie">' + esc(textoVentana(v)) +
        (v.nota ? ' · ' + esc(v.nota) : '') + '</span></span>' +
        (esPendiente(v)
          ? '<button class="btn fantasma" style="min-height:34px;padding:4px 12px" data-a="temp-hecho" data-k="' +
            esc(clave(v)) + '" data-id="' + p.id + '">' + esc(meta.verbo) + '</button>'
          : '<span class="pie">' + (meta.prescriptiva ? 'hecho' : 'en curso') + '</span>') +
      '</div>';
    }).join('') +
    '</div><button class="btn ancho" style="margin-top:10px" data-a="taxon-ver" data-id="' + t.id +
    '">Ver ficha de ' + esc(t.nombre) + '</button></section>';
}

async function accionesEvento(a, id){
  const e = estado.eventos.find(x => x.id === id);
  if (!e) return;
  if (a === 'ev-borrar'){
    if (await confirmar('¿Borrar este evento?', 'Borrar')){ await borrarEvento(id); render(); }
    return;
  }
  const d = await hoja({
    titulo:'Cambiar la fecha',
    campos:[{ k:'fecha', etiqueta:'Fecha del evento', tipo:'fecha', valor:e.fecha }],
    extra:'<p class="pie">La fecha del evento es editable; la hora en que se creó, no.</p>',
  });
  if (!d) return;
  await editarEvento(Object.assign({}, e, { fecha:d.fecha }));
  render();
}

/* Un solo formulario para todos los tipos de evento con alcance de planta.
   Acepta varias plantas: los mismos valores para todas, con lote_id común. */
async function pedirEvento(tipo, ids, fechaPre){
  ids = [].concat(ids);
  if (!ids.length) return false;
  const p = ids.length === 1 ? plantaPorId(ids[0]) : null;
  const varias = ids.length > 1;
  let campos = [], extra = '', titulo = TIPOS_EVENTO[tipo] || 'Evento';

  switch (tipo){
    case 'riego':
      campos = [{ k:'litros', etiqueta:'Litros (opcional)', tipo:'numero', valor:null }];
      break;
    case 'poda':
      campos = [
        { k:'clase', etiqueta:'Tipo de poda', tipo:'select', valor:'mantenimiento',
          opciones:[['mantenimiento','Mantenimiento'],['formacion','Formación'],['sanitaria','Sanitaria'],['pinzado','Pinzado']] },
        { k:'intensidad', etiqueta:'Intensidad', tipo:'select', valor:'ligera',
          opciones:[['ligera','Ligera'],['media','Media'],['fuerte','Fuerte']] },
      ];
      break;
    case 'abonado': {
      const abonos = estado.productos.filter(x => x.clase !== 'fitosanitario');
      campos = [];
      if (abonos.length)
        campos.push({ k:'producto_id', etiqueta:'Producto', tipo:'select', valor:'',
          opciones:[['','— sin registrar —']].concat(abonos.map(x => [x.id, x.nombre_comercial])) });
      campos.push({ k:'dosis', etiqueta:'Dosis', valor:'', ayuda:'10 ml/L, un puñado…' });
      if (!abonos.length)
        extra = '<p class="pie">Da de alta tus abonos en Ajustes → Productos y aquí podrás elegirlos.</p>';
      break;
    }
    case 'cosecha':
      campos = [
        { k:'cantidad', etiqueta:'Cantidad', tipo:'numero', valor:null },
        { k:'unidad', etiqueta:'Unidad', tipo:'select', valor:'g',
          opciones:[['g','gramos'],['kg','kilos'],['ud','unidades']] },
      ];
      break;
    case 'siembra':
      campos = [{ k:'origen', etiqueta:'Origen', tipo:'select', valor:'semilla',
        opciones:[['semilla','Semilla'],['esqueje','Esqueje'],['plantel','Plantel'],['compra','Compra']] }];
      break;
    case 'trasplante':
      campos = [
        { k:'perfil_nuevo', etiqueta:'Nuevo perfil hídrico', tipo:'select',
          opciones:Object.entries(PERFILES).map(([k,v]) => [k, v.etiqueta]),
          valor:p ? p.perfil_hidrico : 'maceta_grande' },
        { k:'litros_nuevo', etiqueta:'Litros', tipo:'numero', valor:p ? p.litros : null },
        { k:'sustrato_nuevo', etiqueta:'Sustrato', valor:p ? p.sustrato : '' },
      ];
      extra = '<p class="pie">El trasplante actualiza la ficha' + (varias ? ' de las ' + ids.length + ' plantas' : '') +
              ': por eso se registra como evento y no se edita a mano.</p>';
      break;
    case 'baja':
      campos = [{ k:'causa', etiqueta:'Causa', valor:'', ayuda:'se secó, se arrancó, se regaló' }];
      extra = '<p class="pie">La planta desaparece de Hoy pero conserva todo su histórico.</p>';
      break;
    case 'nota':
      campos = [{ k:'nota', etiqueta:'Nota', tipo:'textarea', valor:'' }];
      break;
    default:
      return false;
  }
  campos.push({ k:'fecha', etiqueta:'Fecha', tipo:'fecha', valor: fechaPre || fechaRegistro });
  if (tipo !== 'nota') campos.push({ k:'nota', etiqueta:'Nota', valor:'' });

  const d = await hoja({
    titulo: titulo + (varias ? ' · ' + ids.length + ' plantas' : (p ? ' · ' + p.nombre : '')),
    campos, extra, aceptar:'Registrar',
  });
  if (!d) return false;
  if (tipo === 'nota' && !String(d.nota || '').trim()) return false;

  const payload = { tipo };
  if (tipo === 'riego' && d.litros) payload.litros = d.litros;
  if (tipo === 'poda'){ payload.clase = d.clase; payload.intensidad = d.intensidad; }
  if (tipo === 'abonado'){
    payload.producto_id = d.producto_id || null;
    if (!d.dosis && payload.producto_id){
      const pr = productoPorId(payload.producto_id);
      if (pr && pr.dosis_recomendada) d.dosis = pr.dosis_recomendada;
    }
    if (d.dosis) payload.dosis = d.dosis;
  }
  if (tipo === 'cosecha'){ if (d.cantidad != null) payload.cantidad = d.cantidad; payload.unidad = d.unidad; }
  if (tipo === 'siembra') payload.origen = d.origen;
  if (tipo === 'trasplante'){
    payload.perfil_nuevo = d.perfil_nuevo;
    payload.litros_nuevo = d.litros_nuevo;
    payload.sustrato_nuevo = d.sustrato_nuevo;
  }
  if (tipo === 'baja') payload.causa = d.causa || '';

  const lote = varias ? uid() : null;
  for (const id of ids){
    await nuevoEvento({ fecha:d.fecha, alcance:{ tipo:'planta', id },
      payload: Object.assign({}, payload), nota:d.nota, lote_id:lote });
  }
  return true;
}

/* Selector de tipo antes del formulario concreto. */
function elegirTipo(lista, titulo){
  return new Promise(res => {
    const velo = document.createElement('div');
    velo.className = 'velo';
    velo.innerHTML = '<div class="hoja"><h3>' + esc(titulo || 'Qué ha pasado') + '</h3>' +
      '<div class="rejilla">' + lista.map(t =>
        '<button class="btn" data-t="' + t + '">' + esc(TIPOS_EVENTO[t] || t) + '</button>').join('') +
      '</div><button class="btn fantasma ancho" style="margin-top:12px" data-t="">Cancelar</button></div>';
    capas().appendChild(velo);
    velo.addEventListener('click', ev => {
      if (ev.target === velo){ velo.remove(); res(null); return; }
      const b = ev.target.closest('[data-t]');
      if (!b) return;
      velo.remove();
      res(b.dataset.t || null);
    });
  });
}

async function pedirTarea(pre){
  const alcances = [['global','Todo el jardín']]
    .concat(estado.zonas.map(z => ['z:' + z.id, 'Zona · ' + z.nombre]))
    .concat(estado.plantas.filter(p => p.activa).map(p => ['p:' + p.id, 'Planta · ' + p.nombre]));
  const d = await hoja({
    titulo:'Nueva tarea',
    aceptar:'Crear',
    campos:[
      { k:'texto', etiqueta:'Qué hay que hacer', valor:'', ayuda:'atar los tomates' },
      { k:'fecha_prevista', etiqueta:'Para cuándo', tipo:'fecha', valor:(pre && pre.fecha) || hoyISO() },
      { k:'alcance', etiqueta:'A qué afecta', tipo:'select', opciones:alcances,
        valor:(pre && pre.plantaId) ? 'p:' + pre.plantaId : 'global' },
    ],
    extra:'<p class="pie">Las tareas son para lo que no se deduce del log. Los riegos y las ventanas de temporada se calculan solos.</p>',
  });
  if (!d || !d.texto.trim()) return;
  const a = d.alcance === 'global' ? { tipo:'global' }
    : d.alcance.startsWith('z:') ? { tipo:'zona', id:d.alcance.slice(2) }
    : { tipo:'planta', id:d.alcance.slice(2) };
  await nuevaTarea({ texto:d.texto.trim(), fecha_prevista:d.fecha_prevista, alcance:a });
  render();
}

async function completarTarea(id){
  const t = estado.tareas.find(x => x.id === id);
  if (!t) return;
  /* Una reinspección se completa mirando la planta, no apuntando una nota:
     sin la observación de seguimiento no hay curva y todo el registro sobra. */
  if (t.clase === 'reinspeccion' && t.alcance.tipo === 'planta'){
    const ep = t.episodio_id ? episodioPorId(t.episodio_id) : null;
    const hecho = await flujoObservacion(t.alcance.id, ep ? ep.agente_id : null);
    if (!hecho) return;
    const obs = estado.eventos.filter(x => x.payload.tipo === 'observacion');
    t.hecha_evento_id = obs.length ? obs[obs.length - 1].id : null;
    await guardarTarea(t);
    render();
    return;
  }
  const e = await nuevoEvento({ fecha:hoyISO(), alcance:t.alcance, payload:{ tipo:'nota' }, nota:t.texto });
  t.hecha_evento_id = e.id;
  await guardarTarea(t);
  render();
}

/* ═══════════════════════════════════════════════════════════════════
   UI — registro global y ajustes
   ═══════════════════════════════════════════════════════════════════ */

let filtroRegistro = 'todos';

/* La agenda es la pantalla de consulta y de corrección del pasado.
   En móvil, scroll vertical por días: una rejilla mensual daría celdas de 45 px. */
function vistaAgenda(){
  const evs = estado.eventos
    .filter(e => filtroRegistro === 'todos' || e.payload.tipo === filtroRegistro)
    .sort((a,b) => b.fecha.localeCompare(a.fecha) || b.creado_en.localeCompare(a.creado_en))
    .slice(0, 250);

  const chips = [['todos','Todo']].concat(Object.entries(TIPOS_EVENTO))
    .map(([k,t]) => '<button class="chip' + (filtroRegistro === k ? ' on' : '') +
      '" data-a="filtro" data-v="' + k + '">' + t + '</button>').join('');

  let cuerpo = '';
  if (!evs.length){
    cuerpo = '<div class="vacio">Ningún evento con este filtro.</div>';
  } else {
    const porDia = new Map();
    evs.forEach(e => { if (!porDia.has(e.fecha)) porDia.set(e.fecha, []); porDia.get(e.fecha).push(e); });
    const dias = [...porDia.keys()];
    let previo = null;
    cuerpo = dias.map(d => {
      let hueco = '';
      if (previo){
        const n = difDias(d, previo) - 1;
        if (n > 0) hueco = '<button class="hueco" data-a="dia-nuevo" data-v="' + sumarDias(previo, -1) + '">' +
          n + (n === 1 ? ' día' : ' días') + ' sin nada · anotar</button>';
      }
      previo = d;
      return hueco + '<div class="dia">' +
        '<button class="dia-cab" data-a="dia-nuevo" data-v="' + d + '">' +
          '<span class="crece">' + esc(diaConNombre(d)) + '</span><span class="mas">+</span>' +
        '</button>' +
        '<div class="tarjeta">' + listaEventos(porDia.get(d), true, false) + '</div></div>';
    }).join('');
  }

  return bandaAnualHTML() +
    '<section class="bloque"><div class="chips" style="margin-bottom:14px">' + chips + '</div>' +
    cuerpo + '</section>' +
    '<div class="fila-btns"><button class="btn" data-a="dia-nuevo" data-v="' + fechaRegistro + '">Anotar algo</button>' +
    '<button class="btn" data-a="lluvia">Ha llovido</button></div>';
}

function diaConNombre(iso){
  const [a,m,d] = iso.split('-').map(Number);
  const f = new Intl.DateTimeFormat('es-ES', { weekday:'short', day:'numeric', month:'short' })
    .format(new Date(a, m-1, d));
  const hoy = hoyISO();
  return (iso === hoy ? 'Hoy · ' : iso === sumarDias(hoy,-1) ? 'Ayer · ' : '') + f;
}

/* Banda de doce meses: la única vista anual que de verdad se quiere. */
function bandaAnualHTML(){
  const filas = bandaAnual();
  if (!filas.size)
    return '<section class="bloque"><h2>Año</h2><p class="pie">Asigna un taxón a tus plantas y aquí verás en qué quincena cae cada ventana.</p></section>';
  const qHoy = qDeFecha(hoyISO());
  const iniciales = 'EFMAMJJASOND';
  const cabecera = '<div class="banda-meses"><span class="banda-et"></span><span class="banda-celdas">' +
    iniciales.split('').map((l,i) =>
      '<b' + (Math.floor(qHoy/2) === i ? ' class="mes-hoy"' : '') + '>' + l + '</b>').join('') +
    '</span></div>';

  const orden = Object.keys(CLASES_VENTANA).filter(c => filas.has(c));
  const cuerpo = orden.map(c => {
    const meta = CLASES_VENTANA[c], s = filas.get(c);
    const celdas = Array.from({length:24}, (_, i) =>
      '<i class="' + (s.has(i) ? 'on' : '') + (i === qHoy ? ' ahora' : '') +
      '" style="' + (s.has(i) ? 'background:' + meta.color : '') + '"></i>').join('');
    return '<div class="banda-fila"><span class="banda-et">' + esc(meta.etiqueta) + '</span>' +
      '<span class="banda-celdas">' + celdas + '</span></div>';
  }).join('');

  return '<section class="bloque"><h2>Año</h2><div class="tarjeta banda">' + cabecera + cuerpo + '</div></section>';
}

/* ── Taxones ── */

function vistaTaxones(){
  if (!estado.taxones.length)
    return '<div class="vacio">Sin taxones. Importa el catálogo semilla desde Ajustes o crea el tuyo.</div>' +
      '<button class="btn principal ancho" data-a="taxon-nuevo">Nuevo taxón</button>';
  const lista = estado.taxones.slice().sort((a,b) => a.nombre.localeCompare(b.nombre,'es')).map(t => {
    const n = estado.plantas.filter(p => p.taxon_id === t.id).length;
    return '<div class="fila"><button class="toggle" data-a="taxon-ver" data-id="' + t.id + '">' +
      '<span class="cuerpo"><span class="nombre">' + esc(t.nombre) + '</span>' +
      '<span class="meta">' + (t.ventanas || []).length + ' ventanas · ' +
      (n ? n + (n === 1 ? ' planta' : ' plantas') : 'sin plantas') + '</span></span>' +
      '<span class="abrir">›</span></button></div>';
  }).join('');
  return '<section class="bloque"><div class="lista">' + lista + '</div></section>' +
    '<button class="btn principal ancho" data-a="taxon-nuevo">Nuevo taxón</button>';
}

function vistaTaxon(id){
  const t = taxonPorId(id);
  if (!t) return '<div class="vacio">Ese taxón ya no existe.</div>';
  const hoy = hoyISO();
  const ventanas = (t.ventanas || []).map((v, i) => {
    const meta = CLASES_VENTANA[v.clase] || { etiqueta:v.clase, color:'var(--tenue)' };
    const dentro = ventanaContiene(v, hoy);
    return '<div class="dato"><span style="color:var(--texto)">' +
      '<span class="punto" style="background:' + meta.color + ';display:inline-block;margin-right:8px"></span>' +
      esc(meta.etiqueta) + (dentro ? ' <span class="pie">· abierta hoy</span>' : '') +
      '<br><span class="pie">' + esc(textoVentana(v)) + (v.nota ? ' · ' + esc(v.nota) : '') + '</span></span>' +
      '<span style="white-space:nowrap">' +
      '<button class="btn fantasma" style="min-height:34px;padding:4px 10px" data-a="ventana-editar" data-id="' + t.id + '" data-v="' + i + '">Editar</button>' +
      '<button class="btn fantasma peligro" style="min-height:34px;padding:4px 10px" data-a="ventana-borrar" data-id="' + t.id + '" data-v="' + i + '">✕</button>' +
      '</span></div>';
  }).join('') || '<div class="vacio">Sin ventanas todavía.</div>';

  const plantas = estado.plantas.filter(p => p.taxon_id === t.id);
  return '<section class="bloque"><h2>Ventanas</h2><div class="tarjeta">' + ventanas + '</div>' +
    '<div class="fila-btns" style="margin-top:10px">' +
      '<button class="btn" data-a="ventana-nueva" data-id="' + t.id + '">Añadir ventana</button>' +
      '<button class="btn" data-a="taxon-editar" data-id="' + t.id + '">Renombrar</button>' +
    '</div></section>' +
    '<section class="bloque"><h2>Plantas · ' + plantas.length + '</h2><div class="lista">' +
      (plantas.map(p => '<div class="fila"><button class="toggle" data-a="ficha" data-id="' + p.id + '">' +
        '<span class="cuerpo"><span class="nombre">' + esc(p.nombre) + '</span></span></button></div>').join('') ||
        '<div class="vacio">Ninguna planta usa este taxón.</div>') +
    '</div>' +
    (plantas.length ? '' : '<button class="btn peligro ancho" style="margin-top:10px" data-a="taxon-borrar" data-id="' + t.id + '">Borrar taxón</button>') +
    '</section>';
}

async function pedirTaxon(t){
  const d = await hoja({
    titulo: t ? 'Renombrar taxón' : 'Nuevo taxón',
    campos:[{ k:'nombre', etiqueta:'Nombre', valor:t ? t.nombre : '', ayuda:'Tomate, Limonero…' }],
  });
  if (!d || !d.nombre.trim()) return null;
  const obj = t ? Object.assign({}, t, { nombre:d.nombre.trim() })
                : { id:uid(), nombre:d.nombre.trim(), ventanas:[] };
  await guardarTaxon(obj);
  render();
  return obj.id;
}

async function pedirVentana(taxonId, indice){
  const t = taxonPorId(taxonId);
  if (!t) return;
  const v = indice != null ? t.ventanas[indice] : null;
  const meses = MESES.map((m,i) => [i+1, m[0].toUpperCase() + m.slice(1)]);
  const quincenas = [['0','todo el mes'],['1','1ª quincena'],['2','2ª quincena']];
  const d = await hoja({
    titulo: v ? 'Editar ventana' : 'Nueva ventana',
    campos:[
      { k:'clase', etiqueta:'Clase', tipo:'select', valor:v ? v.clase : 'poda',
        opciones:Object.entries(CLASES_VENTANA).map(([k,m]) => [k, m.etiqueta]) },
      { k:'desde_mes', etiqueta:'Desde el mes', tipo:'select', opciones:meses, valor:v ? v.desde.mes : 3 },
      { k:'desde_q', etiqueta:'Desde la quincena', tipo:'select', opciones:quincenas, valor:v ? (v.desde.quincena || 0) : 0 },
      { k:'hasta_mes', etiqueta:'Hasta el mes', tipo:'select', opciones:meses, valor:v ? v.hasta.mes : 5 },
      { k:'hasta_q', etiqueta:'Hasta la quincena', tipo:'select', opciones:quincenas, valor:v ? (v.hasta.quincena || 0) : 0 },
      { k:'cada_dias', etiqueta:'Repetir cada (días, 0 = una vez por temporada)', tipo:'numero',
        valor:v && v.repetible ? v.repetible.cada_dias : 0 },
      { k:'nota', etiqueta:'Nota', valor:v ? (v.nota || '') : '' },
    ],
    extra:'<p class="pie">Si el mes de fin es anterior al de inicio, la ventana cruza el cambio de año: noviembre → febrero es una sola temporada.</p>',
  });
  if (!d) return;
  const nueva = {
    clase: d.clase,
    desde: { mes:Number(d.desde_mes) }, hasta: { mes:Number(d.hasta_mes) },
    nota: d.nota || '',
  };
  if (Number(d.desde_q)) nueva.desde.quincena = Number(d.desde_q);
  if (Number(d.hasta_q)) nueva.hasta.quincena = Number(d.hasta_q);
  if (d.cada_dias > 0) nueva.repetible = { cada_dias: Number(d.cada_dias) };

  const ventanas = (t.ventanas || []).slice();
  if (indice != null) ventanas[indice] = nueva; else ventanas.push(nueva);
  await guardarTaxon(Object.assign({}, t, { ventanas }));
  render();
}

/* Nunca sobrescribe: reimportar no pisa las correcciones propias. */
async function importarSemilla(){
  const existentes = new Set(estado.taxones.map(t => t.nombre.trim().toLowerCase()));
  let nuevos = 0, saltados = 0;
  for (const [nombre, ventanas] of SEMILLA_TAXONES){
    if (existentes.has(nombre.trim().toLowerCase())){ saltados++; continue; }
    const t = { id: uid(), nombre, ventanas: ventanas.map(([clase, dm, dq, hm, hq, cada, nota]) => {
      const v = { clase, desde:{ mes:dm }, hasta:{ mes:hm }, nota: nota || '' };
      if (dq) v.desde.quincena = dq;
      if (hq) v.hasta.quincena = hq;
      if (cada) v.repetible = { cada_dias: cada };
      return v;
    })};
    await guardarTaxon(t);
    nuevos++;
  }
  render();
  aviso('Catálogo: ' + nuevos + ' taxones añadidos' + (saltados ? ', ' + saltados + ' ya los tenías' : '') + '.');
}

function vistaAjustes(){
  const dias = diasDesdeExportacion();
  const zonas = estado.zonas.map(z =>
    '<div class="dato"><span>' + esc(z.nombre) + ' · ' + z.exposicion + '</span>' +
    '<span><button class="btn fantasma" style="min-height:32px;padding:4px 10px" data-a="zona-editar" data-id="' + z.id + '">Editar</button>' +
    '<button class="btn fantasma peligro" style="min-height:32px;padding:4px 10px" data-a="zona-borrar" data-id="' + z.id + '">Borrar</button></span></div>'
  ).join('') || '<div class="vacio">Sin zonas.</div>';

  const completa = diasDesdeCompleta();
  const registros = estado.zonas.length + ' zonas · ' + estado.plantas.length + ' plantas · ' +
    estado.eventos.length + ' eventos · ' + estado.taxones.length + ' taxones · ' +
    estado.tareas.length + ' tareas · ' + estado.media.length + ' fotos';

  const conTaxon = estado.plantas.filter(p => p.activa && p.taxon_id).length;
  const activas = estado.plantas.filter(p => p.activa).length;

  return '<section class="bloque"><h2>Zonas</h2><div class="tarjeta">' + zonas + '</div>' +
    '<button class="btn ancho" style="margin-top:10px" data-a="zona-nueva">Nueva zona</button></section>' +

    '<section class="bloque"><h2>Taxones</h2><div class="tarjeta">' +
      dato('En el catálogo', estado.taxones.length + ' taxones') +
      dato('Plantas con taxón', conTaxon + ' de ' + activas) +
    '</div>' +
    '<div class="fila-btns" style="margin-top:10px">' +
      '<button class="btn" data-a="taxones">Ver taxones</button>' +
      '<button class="btn" data-a="semilla">Importar catálogo semilla</button>' +
    '</div>' +
    '<p class="pie" style="margin-top:8px">El catálogo semilla son ' + SEMILLA_TAXONES.length +
    ' taxones de clima mediterráneo como punto de partida: estará mal para tu microclima y se corrige a mano. ' +
    'Reimportarlo nunca pisa lo que ya tengas.</p></section>' +

    '<section class="bloque"><h2>Sanidad</h2><div class="tarjeta">' +
      dato('Agentes en la lista', estado.agentes.length || 'ninguno todavía') +
      dato('Productos', estado.productos.length) +
      dato('Episodios abiertos', episodiosAbiertos().length + ' de ' + estado.episodios.length) +
    '</div>' +
    '<div class="fila-btns" style="margin-top:10px">' +
      '<button class="btn" data-a="productos">Productos</button>' +
      '<button class="btn" data-a="agentes-semilla">Cargar agentes</button>' +
    '</div>' +
    '<p class="pie" style="margin-top:8px">La lista de agentes se carga sola la primera vez que anotas un síntoma. ' +
    'Los productos los das de alta tú: la app no trae catálogo ni valida qué está autorizado.</p></section>' +

    '<section class="bloque"><h2>Fotos</h2><div class="tarjeta">' +
      dato('Guardadas', estado.media.length + ' · ' + tamano(bytesMedia())) +
      dato('Almacenamiento usado', cuotaActual
        ? tamano(cuotaActual.usado) + ' de ' + tamano(cuotaActual.cupo) +
          ' (' + Math.round(cuotaActual.fraccion * 100) + '%)'
        : 'sin dato') +
      dato('Último backup completo', completa === null ? 'nunca' : (completa === 0 ? 'hoy' : 'hace ' + completa + ' días')) +
    '</div>' +
    (estado.media.length
      ? '<button class="btn ancho" style="margin-top:10px" data-a="purgar">Purgar fotos antiguas</button>' +
        '<p class="pie" style="margin-top:8px">Purgar borra las imágenes anteriores a la fecha que elijas y ' +
        'conserva sus eventos: el histórico se queda, aunque la foto ya no esté.</p>'
      : '') +
    '</section>' +

    '<section class="bloque"><h2>Copia de seguridad</h2><div class="tarjeta">' +
      dato('Datos', registros) +
      dato('Último zip', dias === null ? 'nunca' : (dias === 0 ? 'hoy' : 'hace ' + dias + ' días')) +
      dato('Avisar cada', (estado.meta.recordatorio_dias ?? 7) + ' días') +
    '</div>' +
    '<div class="fila-btns" style="margin-top:10px">' +
      '<button class="btn principal" data-a="exportar">Exportar zip</button>' +
      '<button class="btn" data-a="importar">Importar zip</button>' +
      '<button class="btn fantasma" data-a="recordatorio">Cambiar aviso</button>' +
    '</div>' +
    '<p class="pie" style="margin-top:8px">El zip no se sincroniza con nada: se descarga y tú decides dónde guardarlo. ' +
    'Importar sustituye todos los datos actuales.</p></section>' +

    '<section class="bloque"><h2>Almacenamiento</h2><div class="tarjeta">' +
      dato('Almacenamiento persistente', estado.meta.persist === true ? 'concedido'
        : estado.meta.persist === false ? 'denegado — exporta a menudo' : 'sin comprobar') +
      dato('Instalada', matchMedia('(display-mode: standalone)').matches ? 'sí' : 'no') +
      dato('Esquema del zip', 'v' + ESQUEMA) +
    '</div>' +
    (estado.meta.persist === false
      ? '<p class="pie" style="margin-top:8px">El navegador puede borrar los datos si no abres la app durante días. ' +
        'Instálala en la pantalla de inicio y exporta el zip con frecuencia: mientras tanto, el zip es la persistencia principal, no un backup.</p>'
      : '') +
    '</section>';
}

/* ═══════════════════════════════════════════════════════════════════
   MEDIA — foto de ~1600 px y miniatura de ~200 px, ambas WebP. La
   tabla `media` guarda solo metadatos; los binarios viven en sus
   propios stores y en media/ dentro del zip.
   ═══════════════════════════════════════════════════════════════════ */

async function refrescarCuota(){ cuotaActual = await cuota(); }

const urlsMedia = new Map();     // 'id|mini' → objectURL, revocados al recargar estado

/* Reencodar tiene dos efectos: pesa mucho menos y tira los metadatos EXIF,
   incluidas las coordenadas GPS. Lo segundo es tan deseable como lo primero. */
async function aWebp(bmp, lado, calidad){
  const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * escala));
  const h = Math.max(1, Math.round(bmp.height * escala));
  const lienzo = document.createElement('canvas');
  lienzo.width = w; lienzo.height = h;
  lienzo.getContext('2d').drawImage(bmp, 0, 0, w, h);
  let blob = await new Promise(r => lienzo.toBlob(r, 'image/webp', calidad));
  if (!blob) blob = await new Promise(r => lienzo.toBlob(r, 'image/jpeg', calidad));
  return { blob, ancho:w, alto:h };
}

async function procesarImagen(file){
  /* imageOrientation: 'from-image' aplica la rotación EXIF. Sin esto, las
     fotos verticales se guardan tumbadas y ya no hay forma de saberlo. */
  const bmp = await createImageBitmap(file, { imageOrientation:'from-image' });
  const grande = await aWebp(bmp, MEDIA_LADO, MEDIA_Q);
  const mini   = await aWebp(bmp, THUMB_LADO, THUMB_Q);
  if (bmp.close) bmp.close();
  return { grande, mini };
}

async function anadirFoto(file, eventoId){
  const { grande, mini } = await procesarImagen(file);
  const m = {
    id: uid(),
    nombre_fichero: (String(file.name || 'foto').replace(/\.[^.]*$/, '') || 'foto') + '.webp',
    mime: grande.blob.type,
    ancho: grande.ancho, alto: grande.alto,
    bytes: grande.blob.size,
    creado_en: ahora(),
  };
  await guardar('media', m);
  await guardarClave('media_blobs',  m.id, grande.blob);
  await guardarClave('media_thumbs', m.id, mini.blob);
  estado.media.push(m);
  if (eventoId){
    const e = estado.eventos.find(x => x.id === eventoId);
    if (e){ e.media_ids = (e.media_ids || []).concat(m.id); await editarEvento(e); }
  }
  return m;
}

/* Borrar la foto nunca borra el evento: el registro histórico sobrevive. */
async function borrarFoto(id){
  const e = estado.eventos.find(x => (x.media_ids || []).includes(id));
  if (e){ e.media_ids = e.media_ids.filter(x => x !== id); await editarEvento(e); }
  estado.media = estado.media.filter(m => m.id !== id);
  await borrar('media', id);
  await borrar('media_blobs', id);
  await borrar('media_thumbs', id);
  ['|0','|1'].forEach(sufijo => {
    const k = id + sufijo;
    if (urlsMedia.has(k)){ URL.revokeObjectURL(urlsMedia.get(k)); urlsMedia.delete(k); }
  });
}

async function urlDeMedia(id, mini){
  const k = id + '|' + (mini ? 1 : 0);
  if (urlsMedia.has(k)) return urlsMedia.get(k);
  const blob = await leerClave(mini ? 'media_thumbs' : 'media_blobs', id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlsMedia.set(k, url);
  return url;
}

/* El render es síncrono: se pintan huecos y las imágenes se rellenan después. */
async function hidratarFotos(){
  for (const img of document.querySelectorAll('img[data-media]')){
    if (img.dataset.puesta) continue;
    img.dataset.puesta = '1';
    const url = await urlDeMedia(img.dataset.media, img.dataset.mini === '1');
    if (url) img.src = url; else img.replaceWith(Object.assign(document.createElement('div'),
      { className:'foto-rota', textContent:'sin imagen' }));
  }
}

const eventoDeMedia = id => estado.eventos.find(e => (e.media_ids || []).includes(id)) || null;

function fotosDe(planta){
  return estado.eventos
    .filter(e => e.alcance.tipo === 'planta' && e.alcance.id === planta.id && (e.media_ids || []).length)
    .flatMap(e => e.media_ids.map(id => ({ id, evento:e })))
    .filter(x => mediaPorId(x.id))
    .sort((a,b) => b.evento.fecha.localeCompare(a.evento.fecha));
}

const bytesMedia = () => estado.media.reduce((n, m) => n + (m.bytes || 0), 0);

function tamano(bytes){
  if (bytes == null) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return Math.round(bytes / 1024) + ' kB';
  return (bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0) + ' MB';
}

async function cuota(){
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usado:usage || 0, cupo:quota || 0, fraccion: quota ? (usage || 0) / quota : 0 };
  } catch (_){ return null; }
}

/* Purga: borra fotos anteriores a una fecha y conserva sus eventos. */
async function purgarFotos(antesDe){
  const objetivo = estado.eventos
    .filter(e => e.fecha < antesDe && (e.media_ids || []).length)
    .flatMap(e => e.media_ids.slice());
  for (const id of objetivo) await borrarFoto(id);
  return objetivo.length;
}

function pedirFotos(deCamara){
  return new Promise(res => {
    const inp = $(deCamara ? '#entrada-camara' : '#entrada-galeria');
    const cerrar = () => { inp.onchange = null; };
    inp.onchange = () => {
      const files = [...inp.files];
      inp.value = '';
      cerrar();
      res(files);
    };
    inp.click();
  });
}

async function capturarPara(eventoId, deCamara){
  const files = await pedirFotos(deCamara);
  if (!files.length) return [];
  const t = toast('<p>Procesando ' + files.length + (files.length === 1 ? ' foto…' : ' fotos…') + '</p>', 0);
  const ids = [];
  try {
    for (const f of files) ids.push((await anadirFoto(f, eventoId)).id);
  } catch (err){
    aviso('No se pudo procesar la imagen: ' + err.message);
  }
  t.cerrar();
  return ids;
}

function galeriaHTML(items, tam){
  if (!items.length) return '';
  return '<div class="galeria">' + items.map(x =>
    '<button class="foto" data-a="foto-ver" data-id="' + x.id + '"' +
      (tam ? ' style="width:' + tam + 'px;height:' + tam + 'px"' : '') + '>' +
      '<img data-media="' + x.id + '" data-mini="1" alt="">' +
      (x.evento ? '<span class="foto-fecha">' + fechaCorta(x.evento.fecha) + '</span>' : '') +
    '</button>').join('') + '</div>';
}

/* ═══════════════════════════════════════════════════════════════════
   SANIDAD — una plaga es un proceso: el episodio agrupa observaciones
   y tratamientos para poder responder a si funcionó.
   ═══════════════════════════════════════════════════════════════════ */

async function asegurarAgentes(){
  if (estado.agentes.length) return;
  for (const [nombre, categoria] of SEMILLA_AGENTES)
    await guardarAgente({ id: uid(), nombre, categoria });
}

const eventosDeEpisodio = ep => estado.eventos
  .filter(e => e.episodio_id === ep.id)
  .sort((a,b) => a.fecha.localeCompare(b.fecha) || a.creado_en.localeCompare(b.creado_en));

function ultimaObservacion(ep){
  const obs = eventosDeEpisodio(ep).filter(e => e.payload.tipo === 'observacion');
  return obs.length ? obs[obs.length - 1] : null;
}

const episodiosAbiertos = () => estado.episodios.filter(e => !e.fecha_cierre);

function episodiosDe(planta){
  return estado.episodios
    .filter(ep => ep.alcance.tipo === 'planta' && ep.alcance.id === planta.id)
    .sort((a,b) => b.fecha_inicio.localeCompare(a.fecha_inicio));
}

function diasSinNovedades(ep){
  const u = ultimaObservacion(ep);
  return difDias((u ? u.fecha : ep.fecha_inicio), hoyISO());
}

/* El episodio se abre solo con la primera observación: nunca hay un
   formulario de "crear episodio". */
async function registrarObservacion({ plantaId, agenteId, severidad, mediaIds, fecha, nota }){
  const f = fecha || fechaRegistro;
  let ep = estado.episodios.find(x => !x.fecha_cierre && x.alcance.tipo === 'planta' &&
                                      x.alcance.id === plantaId && x.agente_id === agenteId);
  if (!ep){
    ep = { id: uid(), agente_id: agenteId, alcance:{ tipo:'planta', id:plantaId },
           fecha_inicio: f, fecha_cierre: null, desenlace: null };
    await guardarEpisodio(ep);
  } else if (f < ep.fecha_inicio){
    ep.fecha_inicio = f;
    await guardarEpisodio(ep);
  }
  await nuevoEvento({
    fecha: f, alcance:{ tipo:'planta', id:plantaId },
    payload:{ tipo:'observacion', agente_id:agenteId, severidad },
    episodio_id: ep.id, media_ids: mediaIds || [], nota,
  });
  return ep;
}

async function cerrarEpisodio(id, desenlace){
  const ep = episodioPorId(id);
  if (!ep) return;
  ep.fecha_cierre = hoyISO();
  ep.desenlace = desenlace;
  await guardarEpisodio(ep);
}

/* La curva de severidad con los tratamientos encima: es lo que responde a
   «¿funcionó?», que era la razón de existir de toda la entidad. */
function curvaSVG(ep){
  const evs = eventosDeEpisodio(ep);
  const obs = evs.filter(e => e.payload.tipo === 'observacion');
  const tra = evs.filter(e => e.payload.tipo === 'tratamiento');
  if (obs.length < 1) return '<p class="pie">Sin observaciones todavía.</p>';

  const fin = ep.fecha_cierre || hoyISO();
  const ini = ep.fecha_inicio;
  const total = Math.max(1, difDias(ini, fin));
  const W = 320, H = 120, ML = 26, MB = 20, MT = 10, MR = 8;
  const x = f => ML + (W - ML - MR) * Math.min(1, Math.max(0, difDias(ini, f) / total));
  const y = s => MT + (H - MT - MB) * (1 - s / 3);

  const rejilla = [0,1,2,3].map(s =>
    '<line x1="' + ML + '" y1="' + y(s) + '" x2="' + (W-MR) + '" y2="' + y(s) +
    '" stroke="#3a4530" stroke-width="1"/>' +
    '<text x="2" y="' + (y(s) + 4) + '" fill="#98a289" font-size="9">' + s + '</text>').join('');

  const puntos = obs.map(e => x(e.fecha) + ',' + y(e.payload.severidad)).join(' ');
  const linea = obs.length > 1
    ? '<polyline points="' + puntos + '" fill="none" stroke="#c4643c" stroke-width="2" stroke-linejoin="round"/>' : '';
  const bolas = obs.map(e => '<circle cx="' + x(e.fecha) + '" cy="' + y(e.payload.severidad) +
    '" r="3.5" fill="#c4643c"/>').join('');
  const marcas = tra.map(e => '<line x1="' + x(e.fecha) + '" y1="' + MT + '" x2="' + x(e.fecha) +
    '" y2="' + (H - MB) + '" stroke="#6fb3c9" stroke-width="1.5" stroke-dasharray="3 3"/>' +
    '<circle cx="' + x(e.fecha) + '" cy="' + MT + '" r="3" fill="#6fb3c9"/>').join('');

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="curva" role="img" ' +
    'aria-label="Severidad a lo largo del episodio">' + rejilla + marcas + linea + bolas +
    '<text x="' + ML + '" y="' + (H - 6) + '" fill="#98a289" font-size="9">' + fechaCorta(ini) + '</text>' +
    '<text x="' + (W - MR) + '" y="' + (H - 6) + '" fill="#98a289" font-size="9" text-anchor="end">' +
    fechaCorta(fin) + '</text></svg>' +
    '<p class="pie">Línea naranja: severidad. Marcas azules: tratamientos.</p>';
}

/* ═══════════════════════════════════════════════════════════════════
   PLAZOS — derivados, como los riegos y las ventanas. Nada de un campo
   `bloqueado_hasta` en la planta.
   ═══════════════════════════════════════════════════════════════════ */

const alcanceCubre = (al, p) =>
  al.tipo === 'global' || (al.tipo === 'zona' && al.id === p.zona_id) ||
  (al.tipo === 'planta' && al.id === p.id);

/* Si pulverizas un bancal entero, el plazo aplica a todas las comestibles de
   esa zona, no solo a la que tocaste. Ese es el fallo previsible. */
function plazoActivo(planta, hoy){
  if (!planta.comestible) return null;
  let mejor = null;
  for (const e of estado.eventos){
    if (e.payload.tipo !== 'tratamiento') continue;
    if (!alcanceCubre(e.alcance, planta)) continue;
    const pr = productoPorId(e.payload.producto_id);
    if (!pr || !pr.plazo_seguridad_dias) continue;
    const hasta = sumarDias(e.fecha, pr.plazo_seguridad_dias);
    if (hasta > hoy && (!mejor || hasta > mejor.hasta)) mejor = { hasta, producto:pr, evento:e };
  }
  return mejor;
}

function plantasBloqueadas(hoy){
  return estado.plantas
    .filter(p => p.activa && p.comestible)
    .map(p => ({ planta:p, plazo: plazoActivo(p, hoy) }))
    .filter(x => x.plazo)
    .sort((a,b) => b.plazo.hasta.localeCompare(a.plazo.hasta));
}

const tratamientosDe = planta => estado.eventos
  .filter(e => e.payload.tipo === 'tratamiento' && alcanceCubre(e.alcance, planta))
  .sort((a,b) => a.fecha.localeCompare(b.fecha));

/* Tres aplicaciones seguidas del mismo grupo crean resistencia en tu jardín. */
function avisoResistencia(planta, producto){
  if (!producto.grupo_resistencia) return null;
  const previos = tratamientosDe(planta).slice(-2)
    .map(e => productoPorId(e.payload.producto_id))
    .filter(Boolean);
  if (previos.length < 2) return null;
  if (previos.every(pr => pr.grupo_resistencia === producto.grupo_resistencia))
    return 'Sería la tercera aplicación seguida del grupo ' + producto.grupo_resistencia +
           ' sobre esta planta. Conviene rotar a otro grupo.';
  return null;
}

/* Año natural: es una simplificación, pero es honesta y explicable. */
function aplicacionesCampana(productoId, ano){
  return estado.eventos.filter(e => e.payload.tipo === 'tratamiento' &&
    e.payload.producto_id === productoId && e.fecha.slice(0,4) === String(ano)).length;
}

function avisoIntervalo(planta, producto, fecha){
  if (!producto.intervalo_minimo_dias) return null;
  const previos = tratamientosDe(planta).filter(e => e.payload.producto_id === producto.id);
  if (!previos.length) return null;
  const ultimo = previos[previos.length - 1].fecha;
  const d = difDias(ultimo, fecha);
  if (d < producto.intervalo_minimo_dias)
    return 'El producto pide ' + producto.intervalo_minimo_dias + ' días entre aplicaciones y solo han pasado ' + d + '.';
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   UI — fotos, episodios, productos y plazos
   ═══════════════════════════════════════════════════════════════════ */

/* Alta de síntoma en dos taps: agente y severidad. La foto es un tap más,
   opcional, dentro de la primera pantalla. */
function elegirAgente(titulo, preseleccion){
  return new Promise(res => {
    const usados = new Map();
    estado.eventos.filter(e => e.payload.tipo === 'observacion')
      .forEach(e => usados.set(e.payload.agente_id, (usados.get(e.payload.agente_id) || 0) + 1));
    const orden = estado.agentes.slice().sort((a,b) =>
      (usados.get(b.id) || 0) - (usados.get(a.id) || 0) || a.nombre.localeCompare(b.nombre,'es'));

    const velo = document.createElement('div');
    velo.className = 'velo';
    velo.innerHTML = '<div class="hoja"><h3>' + esc(titulo) + '</h3>' +
      '<div class="fila-btns" style="margin-bottom:12px">' +
        '<button class="btn" data-x="camara">Hacer foto</button>' +
        '<button class="btn" data-x="galeria">De la galería</button>' +
        '<span class="pie" id="cuenta-fotos" style="align-self:center"></span>' +
      '</div>' +
      '<div class="lista-agentes">' + orden.map(a =>
        '<button class="chip agente' + (a.id === preseleccion ? ' on' : '') + '" data-x="ag" data-id="' + a.id + '">' +
        esc(a.nombre) + (NO_BIOTICO.has(a.categoria) ? ' <small>· no es plaga</small>' : '') +
        '</button>').join('') + '</div>' +
      '<div class="fila-btns" style="margin-top:14px">' +
        '<button class="btn fantasma" data-x="no">Cancelar</button>' +
        '<button class="btn fantasma" data-x="nuevo">Otro agente…</button>' +
      '</div></div>';
    capas().appendChild(velo);

    const fotos = [];
    velo.addEventListener('click', async ev => {
      if (ev.target === velo){ velo.remove(); res(null); return; }
      const b = ev.target.closest('[data-x]');
      if (!b) return;
      const x = b.dataset.x;
      if (x === 'camara' || x === 'galeria'){
        const ids = await capturarPara(null, x === 'camara');
        fotos.push(...ids);
        const c = velo.querySelector('#cuenta-fotos');
        if (c) c.textContent = fotos.length ? fotos.length + (fotos.length === 1 ? ' foto' : ' fotos') : '';
        return;
      }
      if (x === 'nuevo'){
        velo.remove();
        const d = await hoja({ titulo:'Nuevo agente', campos:[
          { k:'nombre', etiqueta:'Nombre', valor:'' },
          { k:'categoria', etiqueta:'Categoría', tipo:'select', valor:'insecto',
            opciones:Object.entries(CATEGORIAS_AGENTE) },
        ], extra:'<p class="pie">Carencia y abiótico no son plagas: con ellos la app no ofrecerá fitosanitarios.</p>' });
        if (!d || !d.nombre.trim()){ res(null); return; }
        const a = { id: uid(), nombre:d.nombre.trim(), categoria:d.categoria };
        await guardarAgente(a);
        res({ agente:a, fotos });
        return;
      }
      velo.remove();
      if (x === 'ag') res({ agente: agentePorId(b.dataset.id), fotos });
      else { fotos.forEach(id => borrarFoto(id)); res(null); }
    });
  });
}

function elegirSeveridad(nombreAgente){
  return new Promise(res => {
    const velo = document.createElement('div');
    velo.className = 'velo';
    velo.innerHTML = '<div class="hoja"><h3>' + esc(nombreAgente) + ' · ¿cómo de fuerte?</h3>' +
      '<div class="fila-btns">' +
        [[1,'Leve'],[2,'Media'],[3,'Grave']].map(([n,t]) =>
          '<button class="btn sev-' + n + '" data-x="' + n + '">' + t + '</button>').join('') +
      '</div>' +
      '<button class="btn fantasma ancho" style="margin-top:12px" data-x="0">Ya no se ve nada</button>' +
      '<button class="btn fantasma ancho" style="margin-top:8px" data-x="">Cancelar</button></div>';
    capas().appendChild(velo);
    velo.addEventListener('click', ev => {
      if (ev.target === velo){ velo.remove(); res(null); return; }
      const b = ev.target.closest('[data-x]');
      if (!b) return;
      velo.remove();
      res(b.dataset.x === '' ? null : Number(b.dataset.x));
    });
  });
}

async function flujoObservacion(plantaId, agentePre){
  await asegurarAgentes();
  const p = plantaPorId(plantaId);
  if (!p) return false;
  const elegido = await elegirAgente('¿Qué le pasa a ' + p.nombre + '?', agentePre);
  if (!elegido) return false;
  const sev = await elegirSeveridad(elegido.agente.nombre);
  if (sev === null){ elegido.fotos.forEach(id => borrarFoto(id)); return false; }

  const ep = await registrarObservacion({
    plantaId, agenteId: elegido.agente.id, severidad: sev, mediaIds: elegido.fotos,
  });
  if (sev === 0 && !ep.fecha_cierre){
    if (await confirmar('No queda rastro de ' + elegido.agente.nombre.toLowerCase() + '. ¿Cerrar el episodio como resuelto?', 'Cerrar'))
      await cerrarEpisodio(ep.id, 'resuelto');
    render();
    return true;
  }
  render();
  toast('<p>' + esc(elegido.agente.nombre) + ' · ' + SEVERIDAD[sev] + '</p>' +
    '<div class="chips">' +
      '<button class="chip" data-a="episodio-ver" data-id="' + ep.id + '">Ver episodio</button>' +
      (NO_BIOTICO.has(elegido.agente.categoria)
        ? '<button class="chip" data-a="tratar" data-id="' + ep.id + '">Corregir</button>'
        : '<button class="chip" data-a="tratar" data-id="' + ep.id + '">Tratar ahora</button>') +
    '</div>', 10000);
  return true;
}

/* Con agente `carencia` o `abiotico` no se ofrece ni un fitosanitario. */
function productosPara(agente){
  const noBiotico = agente && NO_BIOTICO.has(agente.categoria);
  return estado.productos.filter(pr => !noBiotico || pr.clase !== 'fitosanitario');
}

async function pedirTratamiento(episodioId, plantaIds, fechaPre){
  const ep = episodioId ? episodioPorId(episodioId) : null;
  const agente = ep ? agentePorId(ep.agente_id) : null;
  let ids = plantaIds ? [].concat(plantaIds) : (ep && ep.alcance.tipo === 'planta' ? [ep.alcance.id] : []);
  if (!ids.length){ aviso('Un tratamiento se registra sobre una planta.'); return false; }
  const p = plantaPorId(ids[0]);
  const disponibles = productosPara(agente);

  if (!disponibles.length){
    const noBiotico = agente && NO_BIOTICO.has(agente.categoria);
    if (await confirmar(noBiotico
      ? 'No tienes abonos ni enmiendas dados de alta. Un problema de ' + agente.categoria +
        ' no se trata con fitosanitarios. ¿Añadir un producto?'
      : 'No tienes productos dados de alta todavía. ¿Añadir uno?', 'Añadir')) location.hash = '#/productos';
    return false;
  }

  const d = await hoja({
    titulo:'Tratamiento' + (p ? ' · ' + p.nombre : ''),
    aceptar:'Registrar',
    campos:[
      { k:'producto_id', etiqueta:'Producto', tipo:'select',
        opciones:disponibles.map(x => [x.id, x.nombre_comercial + (x.materia_activa ? ' · ' + x.materia_activa : '')]),
        valor:disponibles[0].id },
      { k:'dosis_real', etiqueta:'Dosis aplicada', valor: disponibles[0].dosis_recomendada || '' },
      { k:'volumen_l', etiqueta:'Volumen (L)', tipo:'numero', valor:null },
      { k:'metodo', etiqueta:'Método', tipo:'select',
        valor: agente && NO_BIOTICO.has(agente.categoria) ? 'riego' : 'pulverizacion',
        opciones:[['pulverizacion','Pulverización'],['riego','Con el riego'],['manual','Manual'],['trampa','Trampa']] },
      { k:'toda_zona', etiqueta:'Aplicado a toda la zona', tipo:'check', valor:false },
      { k:'fecha', etiqueta:'Fecha', tipo:'fecha', valor: fechaPre || fechaRegistro },
      { k:'nota', etiqueta:'Nota', valor:'' },
    ],
    extra: agente && NO_BIOTICO.has(agente.categoria)
      ? '<p class="pie">' + esc(agente.nombre) + ' es un problema ' + agente.categoria +
        ': aquí solo se ofrecen abonos y enmiendas. Un fungicida sobre una raíz asfixiada no arregla nada.</p>'
      : '',
  });
  if (!d) return false;

  const pr = productoPorId(d.producto_id);
  if (!pr) return false;

  if (!pr.apto_jardineria_domestica && !await confirmar(
      esc(pr.nombre_comercial) + ' no está marcado como apto para jardinería exterior doméstica. ' +
      'La app registra lo que ocurrió, pero conviene comprobarlo en el Registro del MAPA. ¿Seguir?', 'Registrar igual'))
    return false;

  const resistencia = avisoResistencia(p, pr);
  if (resistencia && !await confirmar(resistencia + ' ¿Registrarlo igualmente?', 'Registrar igual')) return false;

  const intervalo = avisoIntervalo(p, pr, d.fecha);
  if (intervalo && !await confirmar(intervalo + ' ¿Registrarlo igualmente?', 'Registrar igual')) return false;

  if (pr.max_aplicaciones_campana){
    const hechas = aplicacionesCampana(pr.id, d.fecha.slice(0,4));
    if (hechas >= pr.max_aplicaciones_campana && !await confirmar(
        'Ya van ' + hechas + ' aplicaciones de ' + pr.nombre_comercial + ' este año y el máximo es ' +
        pr.max_aplicaciones_campana + '. ¿Registrarlo igualmente?', 'Registrar igual')) return false;
  }

  const alcance = d.toda_zona && p
    ? { tipo:'zona', id:p.zona_id }
    : null;
  const payload = { tipo:'tratamiento', producto_id: pr.id, metodo: d.metodo };
  if (d.dosis_real) payload.dosis_real = d.dosis_real;
  if (d.volumen_l != null) payload.volumen_l = d.volumen_l;

  const lote = (!alcance && ids.length > 1) ? uid() : null;
  if (alcance){
    await nuevoEvento({ fecha:d.fecha, alcance, payload, nota:d.nota, episodio_id: ep ? ep.id : null });
  } else {
    for (const id of ids)
      await nuevoEvento({ fecha:d.fecha, alcance:{ tipo:'planta', id }, payload: Object.assign({}, payload),
        nota:d.nota, lote_id:lote, episodio_id: ep ? ep.id : null });
  }

  /* Aquí es donde `Tarea` justifica existir: la reinspección nace de una
     decisión puntual y no se puede derivar del log. */
  if (ep){
    await nuevaTarea({
      texto:'Revisar ' + (agente ? agente.nombre.toLowerCase() : 'el tratamiento') + (p ? ' en ' + p.nombre : ''),
      fecha_prevista: sumarDias(d.fecha, DIAS_REINSPECCION),
      alcance:{ tipo:'planta', id: ids[0] },
      clase:'reinspeccion', episodio_id: ep.id,
    });
  }

  const bloqueada = p && p.comestible && pr.plazo_seguridad_dias
    ? sumarDias(d.fecha, pr.plazo_seguridad_dias) : null;
  render();
  if (bloqueada) aviso('No cosechar hasta el ' + fechaCorta(bloqueada) + '.');
  else if (ep) aviso('Reinspección anotada para dentro de ' + DIAS_REINSPECCION + ' días.');
  return true;
}

/* ── Bloques de la ficha de planta ── */

function fichaSanidad(p){
  const hoy = hoyISO();
  const plazo = plazoActivo(p, hoy);
  const eps = episodiosDe(p);
  const abiertos = eps.filter(e => !e.fecha_cierre);

  const aviso = plazo
    ? '<div class="aviso rojo"><div class="crece"><b>No cosechar hasta el ' + fechaCorta(plazo.hasta) + '</b>' +
      '<div class="pie">' + esc(plazo.producto.nombre_comercial) + ' · plazo de seguridad ' +
      plazo.producto.plazo_seguridad_dias + ' d' +
      (plazo.evento.alcance.tipo === 'zona' ? ' · aplicado a toda la zona' : '') + '</div></div></div>'
    : '';

  const lista = eps.slice(0, 6).map(ep => {
    const ag = agentePorId(ep.agente_id);
    const u = ultimaObservacion(ep);
    return '<div class="dato"><span style="color:var(--texto)">' + esc(ag ? ag.nombre : 'agente') +
      '<br><span class="pie">' + (ep.fecha_cierre ? 'cerrado · ' + (ep.desenlace || '') :
        'abierto desde ' + fechaCorta(ep.fecha_inicio) +
        (u ? ' · último síntoma ' + SEVERIDAD[u.payload.severidad] + ' ' + fechaCorta(u.fecha) : '')) +
      '</span></span>' +
      '<button class="btn fantasma" style="min-height:34px;padding:4px 12px" data-a="episodio-ver" data-id="' +
      ep.id + '">Ver</button></div>';
  }).join('');

  return aviso + '<section class="bloque"><h2>Sanidad</h2>' +
    (eps.length ? '<div class="tarjeta">' + lista + '</div>' : '') +
    '<div class="fila-btns" style="margin-top:' + (eps.length ? '10' : '0') + 'px">' +
      '<button class="btn' + (abiertos.length ? '' : ' principal') + '" data-a="sintoma" data-id="' + p.id + '">Síntoma o plaga</button>' +
      (abiertos.length ? '<button class="btn" data-a="tratar" data-id="' + abiertos[0].id + '">Tratar</button>' : '') +
    '</div></section>';
}

function fichaFotos(p){
  const fotos = fotosDe(p);
  return '<section class="bloque"><h2>Evolución · ' + fotos.length + '</h2>' +
    (fotos.length ? galeriaHTML(fotos) : '<p class="pie">Sin fotos todavía. Una foto cada pocas semanas y en un año se ve crecer.</p>') +
    '<div class="fila-btns" style="margin-top:10px">' +
      '<button class="btn" data-a="foto-camara" data-id="' + p.id + '">Hacer foto</button>' +
      '<button class="btn" data-a="foto-galeria" data-id="' + p.id + '">De la galería</button>' +
    '</div></section>';
}

/* ── Pantalla de episodio: la curva es el producto ── */

function vistaEpisodio(id){
  const ep = episodioPorId(id);
  if (!ep) return '<div class="vacio">Ese episodio ya no existe.</div>';
  const ag = agentePorId(ep.agente_id);
  const p = ep.alcance.tipo === 'planta' ? plantaPorId(ep.alcance.id) : null;
  const evs = eventosDeEpisodio(ep).slice().reverse();
  const sinNovedades = diasSinNovedades(ep);
  const fotos = evs.flatMap(e => (e.media_ids || []).map(mid => ({ id:mid, evento:e }))).filter(x => mediaPorId(x.id));

  return '<section class="bloque"><div class="tarjeta">' +
      dato('Agente', ag ? ag.nombre + ' · ' + CATEGORIAS_AGENTE[ag.categoria] : '—') +
      dato('Planta', p ? p.nombre : '—') +
      dato('Empezó', fechaCorta(ep.fecha_inicio)) +
      dato('Estado', ep.fecha_cierre ? 'cerrado ' + fechaCorta(ep.fecha_cierre) + ' · ' + (ep.desenlace || '') :
        'abierto · ' + sinNovedades + ' d sin novedades') +
    '</div></section>' +

    '<section class="bloque"><h2>Severidad</h2><div class="tarjeta">' + curvaSVG(ep) + '</div></section>' +

    (fotos.length ? '<section class="bloque"><h2>Fotos</h2>' + galeriaHTML(fotos) + '</section>' : '') +

    (!ep.fecha_cierre
      ? '<section class="bloque"><div class="fila-btns">' +
          '<button class="btn principal" data-a="sintoma" data-id="' + (p ? p.id : '') + '" data-v="' + ep.agente_id + '">Nueva observación</button>' +
          '<button class="btn" data-a="tratar" data-id="' + ep.id + '">Tratamiento</button>' +
        '</div>' +
        (sinNovedades >= DIAS_CIERRE_SUGERIDO
          ? '<div class="aviso" style="margin-top:10px"><div class="crece">Van ' + sinNovedades +
            ' días sin observaciones. ¿Se acabó?</div><button class="btn" data-a="episodio-cerrar" data-id="' +
            ep.id + '">Cerrar</button></div>'
          : '<button class="btn fantasma ancho" style="margin-top:8px" data-a="episodio-cerrar" data-id="' +
            ep.id + '">Cerrar episodio</button>') +
        '</section>'
      : '<section class="bloque"><button class="btn fantasma ancho" data-a="episodio-reabrir" data-id="' +
        ep.id + '">Reabrir</button></section>') +

    '<section class="bloque"><h2>Historia</h2><div class="tarjeta">' + listaEventos(evs, false) + '</div></section>';
}

async function pedirCierre(id){
  const d = await hoja({
    titulo:'Cerrar episodio',
    aceptar:'Cerrar',
    campos:[{ k:'desenlace', etiqueta:'¿Cómo acabó?', tipo:'select', valor:'resuelto',
      opciones:[['resuelto','Resuelto'],['cronico','Crónico'],['planta_perdida','Planta perdida'],['abandonado','Abandonado']] }],
    extra:'<p class="pie">Un episodio crónico es un dato legítimo: no todo se resuelve.</p>',
  });
  if (!d) return;
  await cerrarEpisodio(id, d.desenlace);
  const ep = episodioPorId(id);
  if (d.desenlace === 'planta_perdida' && ep.alcance.tipo === 'planta'){
    const p = plantaPorId(ep.alcance.id);
    if (p && p.activa && await confirmar('¿Dar de baja también «' + p.nombre + '»?', 'Dar de baja'))
      await nuevoEvento({ fecha:hoyISO(), alcance:{ tipo:'planta', id:p.id },
        payload:{ tipo:'baja', causa:'perdida por ' + (agentePorId(ep.agente_id) || {nombre:'plaga'}).nombre.toLowerCase() } });
  }
  render();
}

/* ── Productos ── */

function vistaProductos(){
  if (!estado.productos.length)
    return '<div class="vacio">Sin productos. Añade los que uses de verdad: la app no trae catálogo.</div>' +
      '<button class="btn principal ancho" data-a="producto-nuevo">Nuevo producto</button>' +
      '<p class="pie" style="margin-top:12px">La app no sabe qué está autorizado. Los plazos y la casilla de ' +
      'jardinería doméstica los rellenas tú consultando el Registro de Productos Fitosanitarios del MAPA.</p>';

  const fila = pr => '<div class="dato"><span style="color:var(--texto)">' + esc(pr.nombre_comercial) +
    '<br><span class="pie">' + esc(pr.clase) + (pr.materia_activa ? ' · ' + esc(pr.materia_activa) : '') +
    (pr.grupo_resistencia ? ' · grupo ' + esc(pr.grupo_resistencia) : '') +
    (pr.plazo_seguridad_dias ? ' · PS ' + pr.plazo_seguridad_dias + ' d' : '') +
    (pr.apto_jardineria_domestica ? '' : ' · sin marcar como doméstico') + '</span></span>' +
    '<span><button class="btn fantasma" style="min-height:32px;padding:4px 10px" data-a="producto-editar" data-id="' + pr.id + '">Editar</button>' +
    '<button class="btn fantasma peligro" style="min-height:32px;padding:4px 10px" data-a="producto-borrar" data-id="' + pr.id + '">✕</button></span></div>';

  const grupo = (titulo, clase) => {
    const ps = estado.productos.filter(x => x.clase === clase);
    return ps.length ? '<section class="bloque"><h2>' + titulo + '</h2><div class="tarjeta">' +
      ps.map(fila).join('') + '</div></section>' : '';
  };

  return grupo('Fitosanitarios', 'fitosanitario') + grupo('Fertilizantes', 'fertilizante') +
    grupo('Enmiendas', 'enmienda') +
    '<button class="btn principal ancho" data-a="producto-nuevo">Nuevo producto</button>' +
    '<p class="pie" style="margin-top:12px">Los plazos que pongas aquí son los que la app usará para bloquear la ' +
    'cosecha. Compruébalos en la etiqueta o en el Registro del MAPA: la app no valida legalidad, registra lo que le dices.</p>';
}

async function pedirProducto(pr){
  const d = await hoja({
    titulo: pr ? 'Editar producto' : 'Nuevo producto',
    campos:[
      { k:'nombre_comercial', etiqueta:'Nombre comercial', valor: pr ? pr.nombre_comercial : '' },
      { k:'clase', etiqueta:'Clase', tipo:'select', valor: pr ? pr.clase : 'fitosanitario',
        opciones:[['fitosanitario','Fitosanitario'],['fertilizante','Fertilizante'],['enmienda','Enmienda']] },
      { k:'materia_activa', etiqueta:'Materia activa', valor: pr ? pr.materia_activa : '', ayuda:'azufre, jabón potásico…' },
      { k:'grupo_resistencia', etiqueta:'Grupo de resistencia', valor: pr ? pr.grupo_resistencia : '', ayuda:'M2, 3A, 11…' },
      { k:'dosis_recomendada', etiqueta:'Dosis recomendada', valor: pr ? pr.dosis_recomendada : '' },
      { k:'plazo_seguridad_dias', etiqueta:'Plazo de seguridad (días)', tipo:'numero', valor: pr ? pr.plazo_seguridad_dias : null },
      { k:'plazo_reentrada_horas', etiqueta:'Plazo de reentrada (horas)', tipo:'numero', valor: pr ? pr.plazo_reentrada_horas : null },
      { k:'max_aplicaciones_campana', etiqueta:'Máximo de aplicaciones al año', tipo:'numero', valor: pr ? pr.max_aplicaciones_campana : null },
      { k:'intervalo_minimo_dias', etiqueta:'Días mínimos entre aplicaciones', tipo:'numero', valor: pr ? pr.intervalo_minimo_dias : null },
      { k:'apto_jardineria_domestica', etiqueta:'Autorizado para jardinería exterior doméstica', tipo:'check',
        valor: pr ? pr.apto_jardineria_domestica : false },
    ],
    extra:'<p class="pie">El plazo de seguridad es el que bloquea la cosecha en las plantas comestibles. ' +
      'La casilla de jardinería doméstica la rellenas tú tras consultar el Registro del MAPA: la app no lo comprueba.</p>',
  });
  if (!d || !String(d.nombre_comercial).trim()) return false;
  await guardarProducto(Object.assign({ id: pr ? pr.id : uid() }, d,
    { nombre_comercial: d.nombre_comercial.trim() }));
  render();
  return true;
}

/* ── Visor de una foto ── */

function vistaFoto(id){
  const m = mediaPorId(id);
  if (!m) return '<div class="vacio">Esa foto ya no está.</div>';
  const e = eventoDeMedia(id);
  const p = e && e.alcance.tipo === 'planta' ? plantaPorId(e.alcance.id) : null;
  return '<div class="visor"><img data-media="' + m.id + '" data-mini="0" alt=""></div>' +
    '<section class="bloque" style="margin-top:14px"><div class="tarjeta">' +
      dato('Fecha', e ? fechaCorta(e.fecha) : fechaCorta(m.creado_en.slice(0,10))) +
      dato('Planta', p ? p.nombre : '—') +
      dato('Evento', e ? (TIPOS_EVENTO[e.payload.tipo] || e.payload.tipo) + (e.nota ? ' · ' + e.nota : '') : '—') +
      dato('Tamaño', m.ancho + '×' + m.alto + ' · ' + tamano(m.bytes)) +
    '</div>' +
    '<button class="btn peligro ancho" style="margin-top:10px" data-a="foto-borrar" data-id="' + m.id +
    '">Borrar la foto</button>' +
    '<p class="pie" style="margin-top:8px">Borrar la foto no borra el evento: el registro se queda.</p></section>';
}

/* ── Avisos de sanidad y de cuota en Hoy ── */

function vistaSanidadHoy(){
  const hoy = fechaRegistro;
  const bloqueadas = plantasBloqueadas(hoy);
  const dudosos = episodiosAbiertos().filter(ep => diasSinNovedades(ep) >= DIAS_CIERRE_SUGERIDO);
  const abiertos = episodiosAbiertos().filter(ep => diasSinNovedades(ep) < DIAS_CIERRE_SUGERIDO);
  if (!bloqueadas.length && !dudosos.length && !abiertos.length) return '';

  const filaEp = ep => {
    const ag = agentePorId(ep.agente_id);
    const p = ep.alcance.tipo === 'planta' ? plantaPorId(ep.alcance.id) : null;
    const u = ultimaObservacion(ep);
    return '<div class="fila"><button class="toggle" data-a="episodio-ver" data-id="' + ep.id + '">' +
      '<span class="cuerpo"><span class="nombre">' + esc((ag ? ag.nombre : 'Síntoma') + (p ? ' · ' + p.nombre : '')) + '</span>' +
      '<span class="meta">' + (u ? SEVERIDAD[u.payload.severidad] + ' hace ' + difDias(u.fecha, hoy) + ' d' : 'sin observaciones') +
      '</span></span></button></div>';
  };

  return '<section class="bloque"><h2>Sanidad</h2>' +
    (bloqueadas.length
      ? '<div class="aviso rojo"><div class="crece"><b>No cosechar</b><div class="pie">' +
        esc(bloqueadas.map(x => x.planta.nombre + ' hasta el ' + fechaCorta(x.plazo.hasta)).join(' · ')) +
        '</div></div></div>' : '') +
    (abiertos.length || dudosos.length
      ? '<div class="lista">' + abiertos.concat(dudosos).map(filaEp).join('') + '</div>' : '') +
    (dudosos.length
      ? '<p class="pie" style="margin-top:8px">' + dudosos.length +
        (dudosos.length === 1 ? ' episodio lleva' : ' episodios llevan') + ' más de ' + DIAS_CIERRE_SUGERIDO +
        ' días sin novedades: ábrelo para cerrarlo o para anotar cómo va.</p>' : '') +
    '</section>';
}

/* ═══════════════════════════════════════════════════════════════════
   ROUTER
   ═══════════════════════════════════════════════════════════════════ */

function rutaActual(){
  const h = (location.hash || '#/hoy').slice(2).split('/');
  return { pantalla: h[0] || 'hoy', arg: h[1] || null };
}

function render(){
  const { pantalla, arg } = rutaActual();
  const cab = $('#cabecera');
  let cuerpo = '', extra = '';

  if (pantalla === 'planta'){
    const p = plantaPorId(arg);
    cab.innerHTML = '<button class="btn fantasma" data-a="atras" style="min-height:38px;padding:6px 10px">‹</button>' +
      '<div class="crece"><h1>' + esc(p ? p.nombre : 'Planta') + '</h1></div>';
    cuerpo = vistaFicha(arg);
    pintarTabs('plantas');
  } else if (pantalla === 'plantas'){
    cab.innerHTML = '<div class="crece"><h1>Plantas</h1></div>';
    cuerpo = vistaPlantas();
    pintarTabs('plantas');
  } else if (pantalla === 'agenda' || pantalla === 'registro'){
    cab.innerHTML = '<div class="crece"><h1>Agenda</h1></div>';
    cuerpo = vistaAgenda();
    pintarTabs('agenda');
  } else if (pantalla === 'taxones'){
    cab.innerHTML = '<button class="btn fantasma" data-a="atras" style="min-height:38px;padding:6px 10px">‹</button>' +
      '<div class="crece"><h1>Taxones</h1></div>';
    cuerpo = vistaTaxones();
    pintarTabs('ajustes');
  } else if (pantalla === 'taxon'){
    const t = taxonPorId(arg);
    cab.innerHTML = '<button class="btn fantasma" data-a="atras" style="min-height:38px;padding:6px 10px">‹</button>' +
      '<div class="crece"><h1>' + esc(t ? t.nombre : 'Taxón') + '</h1></div>';
    cuerpo = vistaTaxon(arg);
    pintarTabs('ajustes');
  } else if (pantalla === 'episodio'){
    const ep = episodioPorId(arg);
    const ag = ep ? agentePorId(ep.agente_id) : null;
    cab.innerHTML = '<button class="btn fantasma" data-a="atras" style="min-height:38px;padding:6px 10px">‹</button>' +
      '<div class="crece"><h1>' + esc(ag ? ag.nombre : 'Episodio') + '</h1></div>';
    cuerpo = vistaEpisodio(arg);
    pintarTabs('plantas');
  } else if (pantalla === 'productos'){
    cab.innerHTML = '<button class="btn fantasma" data-a="atras" style="min-height:38px;padding:6px 10px">‹</button>' +
      '<div class="crece"><h1>Productos</h1></div>';
    cuerpo = vistaProductos();
    pintarTabs('ajustes');
  } else if (pantalla === 'foto'){
    cab.innerHTML = '<button class="btn fantasma" data-a="atras" style="min-height:38px;padding:6px 10px">‹</button>' +
      '<div class="crece"><h1>Foto</h1></div>';
    cuerpo = vistaFoto(arg);
    pintarTabs('plantas');
  } else if (pantalla === 'ajustes'){
    cab.innerHTML = '<div class="crece"><h1>Ajustes</h1></div>';
    cuerpo = vistaAjustes();
    pintarTabs('ajustes');
  } else {
    const retro = fechaRegistro !== hoyISO();
    cab.innerHTML = '<div class="crece"><h1>Hoy</h1>' +
      '<div class="pie">' + (retro ? 'apuntando en otra fecha' : diaLargo()) + '</div></div>' +
      '<input type="date" id="fecha-registro" class="fecha-cab' + (retro ? ' retro' : '') +
      '" value="' + fechaRegistro + '" aria-label="Fecha con la que se apunta">' +
      (retro ? '<button class="btn fantasma" data-a="fecha-hoy" style="min-height:38px;padding:6px 10px">Hoy</button>' : '');
    cuerpo = vistaHoy();
    extra = barraAccion();
    pintarTabs('hoy');
  }

  $('#app').innerHTML = cuerpo;
  hidratarFotos();
  const vieja = document.querySelector('.accion');
  if (vieja) vieja.remove();
  document.body.classList.toggle('con-accion', !!extra);
  if (extra) document.body.insertAdjacentHTML('beforeend', extra);
}

function diaLargo(){
  return new Intl.DateTimeFormat('es-ES', { weekday:'long', day:'numeric', month:'long' })
    .format(new Date());
}

/* ── un solo manejador de clics, delegado ── */
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-a]');
  if (!b) return;
  const a = b.dataset.a, id = b.dataset.id, v = b.dataset.v;

  switch (a){
    case 'marcar':
      seleccionManual = true;
      if (seleccion.has(id)) seleccion.delete(id); else seleccion.add(id);
      render();
      break;
    case 'nada':      seleccionManual = true; seleccion.clear(); render(); break;
    case 'regar':     await registrarRiego(); break;
    case 'cal':       await calibrar(v); break;
    case 'deshacer':  await deshacerLote(); break;
    case 'lluvia':    await pedirLluvia(); break;
    case 'ficha':     location.hash = '#/planta/' + id; break;
    case 'atras':     history.length > 1 ? history.back() : (location.hash = '#/plantas'); break;
    case 'planta-nueva': {
      const nuevo = await pedirPlanta(null);
      if (nuevo) location.hash = '#/planta/' + nuevo; else render();
      break;
    }
    case 'planta-editar': await pedirPlanta(plantaPorId(id)); render(); break;
    case 'planta-borrar': {
      const p = plantaPorId(id);
      if (!p) break;
      if (await confirmar('¿Eliminar «' + p.nombre + '» y todo su histórico? Para conservarlo, usa "Dar de baja".', 'Eliminar')){
        const suyos = estado.eventos.filter(e => e.alcance.tipo === 'planta' && e.alcance.id === id);
        for (const e of suyos) await borrarEvento(e.id);
        estado.plantas = estado.plantas.filter(x => x.id !== id);
        await borrar('plantas', id);
        reindexar();
        location.hash = '#/plantas';
      }
      break;
    }
    case 'regar-una':
      await nuevoEvento({ fecha:hoyISO(), alcance:{ tipo:'planta', id }, payload:{ tipo:'riego' } });
      render();
      break;
    case 'nota':        if (await pedirEvento('nota', [id])) render(); break;
    case 'trasplante':  if (await pedirEvento('trasplante', [id])) render(); break;
    case 'siembra':     if (await pedirEvento('siembra', [id])) render(); break;
    case 'baja':        if (await pedirEvento('baja', [id])) render(); break;
    case 'evento-otro': {
      const t = await elegirTipo(['poda','abonado','cosecha','siembra','trasplante','nota','baja'], 'Qué ha pasado');
      if (t && await pedirEvento(t, [id])) render();
      break;
    }
    case 'tarea-nueva':  await pedirTarea({ plantaId:id, fecha:fechaRegistro }); break;
    case 'tarea-hecha':  await completarTarea(id); break;
    case 'tarea-fuera': {
      const t = estado.tareas.find(x => x.id === id);
      if (t){ t.descartada = true; await guardarTarea(t); render(); }
      break;
    }
    case 'revivir': {
      const p = plantaPorId(id);
      p.activa = true;
      await guardarPlanta(p);
      render();
      break;
    }
    case 'ev-borrar':
    case 'ev-fecha':    await accionesEvento(a, id); break;
    case 'filtro':      filtroRegistro = v; render(); break;
    case 'temporada':   temporadaAbierta = !temporadaAbierta; render(); break;
    case 'grupo':       grupoAbierto = grupoAbierto === b.dataset.k ? null : b.dataset.k; render(); break;
    case 'temp-hecho': {
      const g = gruposTemporada(fechaRegistro).find(x => x.clave === b.dataset.k);
      if (!g) break;
      const ids = id ? [id] : g.plantas.map(p => p.id);
      if (await pedirEvento(g.meta.evento, ids, fechaRegistro)) render();
      break;
    }
    case 'dia-nuevo': {
      const t = await elegirTipo(['riego','poda','abonado','cosecha','siembra','trasplante','nota','baja'], 'Anotar en ' + fechaCorta(v));
      if (!t) break;
      const activas = estado.plantas.filter(p => p.activa);
      if (!activas.length){ aviso('Primero hace falta una planta.'); break; }
      const d = await hoja({
        titulo:'¿A qué planta?',
        aceptar:'Seguir',
        campos:[{ k:'planta', etiqueta:'Planta', tipo:'select',
          opciones:activas.map(p => [p.id, p.nombre]), valor:activas[0].id }],
      });
      if (d && await pedirEvento(t, [d.planta], v)) render();
      break;
    }
    case 'taxones':     location.hash = '#/taxones'; break;
    case 'taxon-ver':   location.hash = '#/taxon/' + id; break;
    case 'taxon-nuevo': {
      const nuevo = await pedirTaxon(null);
      if (nuevo) location.hash = '#/taxon/' + nuevo;
      break;
    }
    case 'taxon-editar': await pedirTaxon(taxonPorId(id)); break;
    case 'taxon-borrar': {
      if (estado.plantas.some(p => p.taxon_id === id)){ aviso('Hay plantas usando este taxón.'); break; }
      if (await confirmar('¿Borrar el taxón y sus ventanas?', 'Borrar')){
        await borrarTaxon(id);
        location.hash = '#/taxones';
      }
      break;
    }
    case 'ventana-nueva':  await pedirVentana(id, null); break;
    case 'ventana-editar': await pedirVentana(id, Number(v)); break;
    case 'ventana-borrar': {
      const t = taxonPorId(id);
      if (!t) break;
      if (await confirmar('¿Borrar esta ventana?', 'Borrar')){
        const ventanas = t.ventanas.slice();
        ventanas.splice(Number(v), 1);
        await guardarTaxon(Object.assign({}, t, { ventanas }));
        render();
      }
      break;
    }
    case 'semilla':
      if (await confirmar('Se añadirán los taxones que falten. Los que ya tengas no se tocan.', 'Importar'))
        await importarSemilla();
      break;
    case 'zona-nueva':  await pedirZona(null); break;
    case 'zona-editar': await pedirZona(estado.zonas.find(z => z.id === id)); break;
    case 'zona-borrar': {
      const usada = estado.plantas.some(p => p.zona_id === id);
      if (usada){ aviso('Esa zona tiene plantas dentro. Muévelas antes de borrarla.'); break; }
      if (await confirmar('¿Borrar la zona?', 'Borrar')){
        estado.zonas = estado.zonas.filter(z => z.id !== id);
        await borrar('zonas', id);
        render();
      }
      break;
    }
    case 'exportar': {
      b.disabled = true;
      try {
        const r = await pedirExportacion();
        if (r) aviso('Zip generado: ' + r.nombre + ' · ' + tamano(r.bytes) +
          (r.fotos ? ' · ' + r.fotos + ' fotos' : ''));
      } catch (err){ aviso('No se pudo exportar: ' + err.message); }
      b.disabled = false;
      await refrescarCuota();
      render();
      break;
    }
    case 'sintoma':   await flujoObservacion(id, v || null); break;
    case 'tratar':    await pedirTratamiento(id); break;
    case 'episodio-ver': capas().innerHTML = ''; location.hash = '#/episodio/' + id; break;
    case 'episodio-cerrar': await pedirCierre(id); break;
    case 'episodio-reabrir': {
      const ep = episodioPorId(id);
      ep.fecha_cierre = null; ep.desenlace = null;
      await guardarEpisodio(ep);
      render();
      break;
    }
    case 'productos':      location.hash = '#/productos'; break;
    case 'producto-nuevo': await pedirProducto(null); break;
    case 'producto-editar':await pedirProducto(productoPorId(id)); break;
    case 'producto-borrar': {
      const pr = productoPorId(id);
      const usado = estado.eventos.some(e => e.payload.producto_id === id);
      if (usado){ aviso('Ese producto está usado en el histórico: si lo borras, los plazos dejarían de calcularse.'); break; }
      if (pr && await confirmar('¿Borrar ' + pr.nombre_comercial + '?', 'Borrar')){ await borrarProducto(id); render(); }
      break;
    }
    case 'agentes-semilla':
      await asegurarAgentes();
      aviso(estado.agentes.length + ' agentes en la lista.');
      render();
      break;
    case 'foto-ver':   location.hash = '#/foto/' + id; break;
    case 'foto-borrar': {
      if (!await confirmar('¿Borrar la foto? El evento se queda.', 'Borrar')) break;
      const e = eventoDeMedia(id);
      await borrarFoto(id);
      await refrescarCuota();
      const p = e && e.alcance.tipo === 'planta' ? e.alcance.id : null;
      location.hash = p ? '#/planta/' + p : '#/hoy';
      render();
      break;
    }
    case 'foto-camara':
    case 'foto-galeria': {
      const files = await pedirFotos(a === 'foto-camara');
      if (!files.length) break;
      const t = toast('<p>Procesando ' + files.length + (files.length === 1 ? ' foto…' : ' fotos…') + '</p>', 0);
      try {
        const e = await nuevoEvento({ fecha:fechaRegistro, alcance:{ tipo:'planta', id },
          payload:{ tipo:'nota' }, nota:'Foto' });
        for (const f of files) await anadirFoto(f, e.id);
      } catch (err){ aviso('No se pudo procesar la imagen: ' + err.message); }
      t.cerrar();
      await refrescarCuota();
      render();
      break;
    }
    case 'ev-foto': {
      const ids = await capturarPara(id, true);
      if (ids.length) await refrescarCuota();
      render();
      break;
    }
    case 'purgar': {
      const d = await hoja({
        titulo:'Purgar fotos',
        aceptar:'Borrar fotos',
        campos:[{ k:'antes', etiqueta:'Borrar las anteriores a', tipo:'fecha', valor: sumarDias(hoyISO(), -365) }],
        extra:'<p class="pie">Los eventos se conservan. Exporta un zip completo antes: esto no tiene vuelta atrás.</p>',
      });
      if (!d) break;
      const n = await purgarFotos(d.antes);
      await refrescarCuota();
      aviso(n ? n + (n === 1 ? ' foto borrada.' : ' fotos borradas.') : 'No había fotos anteriores a esa fecha.');
      render();
      break;
    }
    case 'importar':   $('#entrada-zip').click(); break;
    case 'recordatorio': {
      const d = await hoja({
        titulo:'Recordatorio de copia',
        campos:[{ k:'dias', etiqueta:'Avisar en Hoy cada (días)', tipo:'numero', valor:estado.meta.recordatorio_dias ?? 7 }],
      });
      if (d && d.dias > 0){ await ponerMeta('recordatorio_dias', Number(d.dias)); render(); }
      break;
    }
    case 'fecha-hoy':  fechaRegistro = hoyISO(); seleccion.clear(); seleccionManual = false; render(); break;
  }
});

document.addEventListener('change', async ev => {
  if (ev.target.id === 'fecha-registro'){
    fechaRegistro = ev.target.value || hoyISO();
    seleccion.clear();
    seleccionManual = false;
    aviso(fechaRegistro === hoyISO() ? 'Apuntando en hoy.' : 'Apuntando en ' + fechaCorta(fechaRegistro) + '.');
    render();
  }
  if (ev.target.id === 'entrada-zip'){
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    if (!await confirmar('Importar sustituye TODOS los datos actuales por los del zip. ¿Seguir?', 'Importar')) return;
    try {
      const m = await importar(f);
      aviso('Importado: ' + Object.values(m.registros).reduce((a,b) => a+b, 0) + ' registros.');
      render();
    } catch (err){ aviso('No se pudo importar: ' + err.message); }
  }
});

window.addEventListener('hashchange', () => { seleccion.clear(); seleccionManual = false; render(); });

/* ═══════════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════════ */

async function arrancar(){
  document.body.insertAdjacentHTML('beforeend',
    '<input type="file" id="entrada-zip" accept=".zip,application/zip" hidden>' +
    '<input type="file" id="entrada-camara" accept="image/*" capture="environment" hidden>' +
    '<input type="file" id="entrada-galeria" accept="image/*" multiple hidden>');
  try {
    db = await abrirDB();
    await cargarEstado();
  } catch (err){
    $('#app').innerHTML = '<div class="vacio">No se pudo abrir la base de datos: ' + esc(err.message) +
      '<br>Si el navegador está en modo privado, IndexedDB no está disponible.</div>';
    return;
  }
  render();
  refrescarCuota().then(() => { if (cuotaActual && cuotaActual.fraccion >= AVISO_CUOTA) render(); });

  if ('serviceWorker' in navigator){
    try { await navigator.serviceWorker.register('./sw.js'); } catch (_) { /* sin offline, la app sigue */ }
  }
  if (navigator.storage && navigator.storage.persist){
    try {
      const ya = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      const ok = ya || await navigator.storage.persist();
      if (estado.meta.persist !== ok) await ponerMeta('persist', ok);
    } catch (_) { /* el navegador no lo soporta */ }
  }
}

arrancar();
