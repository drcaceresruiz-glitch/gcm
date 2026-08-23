/**
 * Mete las cinco hojas reparadas dentro del contenedor del documento.
 *
 * Cada hoja vive en su propio archivo (hojas/CLAVE.fix.html) y el contenedor
 * (plantilla.html) tiene una ranura <!--SLOT:clave--> por hoja y un
 * <!--PIE:clave--> para su explicacion. Se hace aqui y no a mano porque son
 * ~150 KB de HTML y pegarlos a mano es como se cuela una etiqueta sin cerrar.
 */
const fs = require("fs");
const path = require("path");

const BASE = __dirname;
const HOJAS = ["portada", "dashboard", "cronograma", "bitacora", "control"];

// Vertical u apaisada: decide la orientacion del papel al imprimir.
const ORIENTACION = {
  portada: "v",
  dashboard: "h",
  cronograma: "h",
  bitacora: "v",
  control: "h",
};

const PIES = {
  portada:
    "<b>Portada.</b> Se conserva el gesto que la define — las dos reglas negras abrazando el rótulo en Montserrat ligero, y el silencio blanco alrededor. Lo añadido va al pie, sin invadir el centro.",
  dashboard:
    "<b>Dashboard de control.</b> La hoja que más había que respetar: donut, par planeado/desviación, capítulos con su marca negra del planeado, curva S con su anotación en el corte, alertas y partidas activas. Las cifras son las suyas del 08/08.",
  cronograma:
    "<b>Cronograma.</b> El volcado de MS&nbsp;Project, pero legible: se conserva la tabla con sus columnas y el Gantt con su escala, y se hace visible lo que ahí importa — ruta crítica, atrasos y la fecha de corte.",
  bitacora:
    "<b>Bitácora diaria.</b> Intacta en su identidad: regla superior, rótulo a la derecha, semana gigante en gris, cuadrícula 2×3 con sello de geolocalización y el bloque de trabajo realizado.",
  control:
    "<b>Control económico y Last Planner.</b> La hoja que hoy no existe. El informe actual cuenta el avance físico en detalle y calla el dinero y la confiabilidad del plan — que es justo lo que GCM ya sabe calcular.",
};

let doc = fs.readFileSync(path.join(BASE, "plantilla.html"), "utf8");
const informe = [];

for (const clave of HOJAS) {
  const fix = path.join(BASE, "hojas", clave + ".fix.html");
  const orig = path.join(BASE, "hojas", clave + ".html");
  const usar = fs.existsSync(fix) ? fix : orig;

  let html = fs.readFileSync(usar, "utf8").trim();

  // Quita cercos de codigo si el agente los dejo puestos.
  html = html.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "").trim();

  // La clase de orientacion la pone el ensamblador, no la hoja: la hoja no
  // tiene por que saber como se imprime el documento que la contiene.
  const clase = "hoja hoja-" + clave + " hoja--" + ORIENTACION[clave];
  html = html.replace(
    /^<article([^>]*?)class="[^"]*"/i,
    '<article$1class="' + clase + '"'
  );

  const abre = (html.match(/<article/gi) || []).length;
  const cierra = (html.match(/<\/article>/gi) || []).length;
  const estilos = (html.match(/<style/gi) || []).length;
  const fuera = [];
  // Selectores que no empiezan por el prefijo de la hoja: rompen las otras hojas.
  const bloque = html.match(/<style[\s\S]*?<\/style>/i);
  if (bloque) {
    const sel = bloque[0]
      .replace(/<\/?style[^>]*>/gi, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("}")
      .map((s) => s.split("{")[0].trim())
      .filter(Boolean);
    for (const s of sel) {
      if (s.startsWith("@")) continue;
      for (const parte of s.split(",")) {
        const t = parte.trim();
        if (t && !t.startsWith(".hoja-" + clave)) fuera.push(t);
      }
    }
  }

  informe.push({
    clave,
    origen: path.basename(usar),
    kb: Math.round(html.length / 1024),
    article: abre + "/" + cierra,
    estilos,
    selectoresFuera: fuera.length,
    ejemploFuera: fuera.slice(0, 3),
    nuevos: (html.match(/data-nuevo/g) || []).length,
    manuales: (html.match(/data-manual/g) || []).length,
  });

  doc = doc.replace("<!--SLOT:" + clave + "-->", html);
  doc = doc.replace("<!--PIE:" + clave + "-->", PIES[clave]);
}

fs.writeFileSync(path.join(BASE, "informes-al-corte.html"), doc);

console.table(informe);
const faltan = HOJAS.filter((c) => doc.includes("<!--SLOT:" + c + "-->"));
console.log("ranuras sin llenar:", faltan.length ? faltan.join(", ") : "ninguna");
console.log("documento final:", Math.round(doc.length / 1024) + " KB");
