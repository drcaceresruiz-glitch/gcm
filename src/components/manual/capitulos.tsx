import type { ReactNode } from "react";

/**
 * El manual didactico de GCM, capitulo a capitulo.
 *
 * Vive DENTRO de la aplicacion y no en un PDF aparte por lo mismo que los
 * textos de ayuda: quien entra nuevo ya esta aqui, y un manual que hay que
 * ir a buscar a otro sitio es un manual que no se lee. Ademas viaja con el
 * producto: cada constructora que use GCM lo tiene, en la version que
 * corresponde a SU aplicacion.
 *
 * COMO SE ESCRIBE UN CAPITULO (la plantilla es doctrina, no sugerencia):
 *
 *   - **La pregunta que contesta**, con las palabras del menu: el menu de la
 *     obra ya es el indice del manual, cada seccion lleva su pregunta al
 *     lado y el orden es el del trabajo real, no el alfabetico.
 *   - **Para quien es**: que rol lo va a leer.
 *   - **La idea**, antes que los pasos: quien entiende el porque se equivoca
 *     menos cuando cambia el contexto. Es la misma regla de los textos de
 *     `lib/explicaciones`.
 *   - **El recorrido de la primera vez**, numerado.
 *   - **Lo que sale mal**: un manual que dice «esto se rompe asi» vale mas
 *     que uno que solo dice donde pulsar. Los modos de fallo son reales,
 *     vienen de obras de verdad.
 *
 * Un capitulo con `contenido: null` esta POR ESCRIBIR y el indice lo dice
 * con esas palabras: esconder lo que falta seria ensenar a desconfiar del
 * indice.
 */

export interface CapituloManual {
  slug: string;
  titulo: string;
  /// La pregunta que contesta, con las palabras del menu.
  pregunta: string;
  /// Que roles lo van a leer.
  paraQuien: string;
  /// Un parrafo honesto para el indice.
  resumen: string;
  /// null = por escribir. El indice lo dice, no lo esconde.
  contenido: ReactNode | null;
}

// ---------------------------------------------------------------------------
// Las piezas con las que se arma un capitulo
// ---------------------------------------------------------------------------

function S({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
      <div className="space-y-2.5 text-sm leading-relaxed text-pretty opacity-90">
        {children}
      </div>
    </section>
  );
}

/** La idea central del capitulo, destacada: es lo que hay que llevarse. */
function Clave({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-lg border-l-4 px-4 py-3 text-sm leading-relaxed text-pretty"
      style={{
        borderColor: "var(--color-marca-600)",
        backgroundColor:
          "color-mix(in oklab, var(--color-marca-600) 8%, transparent)",
      }}
    >
      {children}
    </div>
  );
}

function Recorrido({ pasos }: { pasos: ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-pretty">
      {pasos.map((paso, i) => (
        <li key={i} className="pl-1">
          {paso}
        </li>
      ))}
    </ol>
  );
}

/** Los modos de fallo: que se hace, que pasa, y como se ve a tiempo. */
function SaleMal({ casos }: { casos: { hace: string; pasa: ReactNode }[] }) {
  return (
    <ul className="space-y-3">
      {casos.map((caso, i) => (
        <li
          key={i}
          className="rounded-lg border p-3 text-sm leading-relaxed"
          style={{ borderColor: "var(--borde)" }}
        >
          <p className="font-medium">{caso.hace}</p>
          <div className="mt-1 text-pretty opacity-80">{caso.pasa}</div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Capitulo: empezar
// ---------------------------------------------------------------------------

const EMPEZAR = (
  <>
    <Clave>
      GCM no se organiza por pantallas sino por <strong>preguntas</strong>:
      cuánto cuesta, cuándo se hace, qué se compromete, a quién se le debe.
      El menú las lleva escritas al lado de cada sección, en el orden del
      trabajo real. Si sabes qué pregunta tienes, sabes dónde ir — y este
      manual sigue ese mismo orden.
    </Clave>

    <S titulo="Los roles: quién es quién">
      <p>
        <strong>ADMIN</strong> responde de la constructora entera: ve todas
        las obras, configura la empresa y es quien da de alta a los demás.{" "}
        <strong>RESIDENTE</strong> lleva obras concretas: reporta avance,
        gestiona su plan y su gente. <strong>CONSULTOR</strong> mira sin
        tocar: lee las obras que le asignen. Lo que cada rol puede hacer en
        detalle vive en <em>Mi constructora → Permisos</em>, y se puede
        ajustar — pero la matriz que viene de fábrica ya refleja cómo se
        trabaja en obra, y tocarla sin una razón concreta solo fabrica
        sorpresas.
      </p>
    </S>

    <S titulo="Quién ve qué: el alcance por obra">
      <p>
        Dentro de la empresa, cada persona ve <strong>solo las obras que
        tiene asignadas</strong>. La asignación se hace obra por obra, en la
        sección <em>Equipo</em> de cada una, y queda anotada en la auditoría.
        El ADMIN es el único que ve toda la cartera sin que nadie lo asigne:
        esa es justamente la definición de responder por todas.
      </p>
      <p>
        La consecuencia que sorprende la primera vez: un residente o un
        consultor <strong>recién dado de alta no ve ninguna obra</strong>.
        No es un fallo — nadie le ha dicho todavía cuáles son las suyas. El
        día que se cree el usuario hay que pasar por <em>Equipo</em> y
        asignarle su obra, o entrará a un panel vacío.
      </p>
      <p>
        Por lo mismo, «no hay obras» significa dos cosas distintas según
        quién lo lee: para el ADMIN, que la empresa no tiene obras; para los
        demás, que no le han asignado ninguna. La pantalla lo dice con esas
        palabras.
      </p>
    </S>

    <S titulo="El recorrido de la primera vez (una constructora nueva)">
      <Recorrido
        pasos={[
          <>
            <strong>Datos y logo</strong>: el nombre y el logo salen en los
            documentos que se imprimen y se envían — conviene dejarlos antes
            de generar el primer PDF.
          </>,
          <>
            <strong>Contratistas</strong>: la lista de con quién se trabaja,
            con su RUC y el impuesto que emite cada uno. De ahí se hereda
            después el impuesto de cada orden, para no acertarlo a mano.
          </>,
          <>
            <strong>Personas</strong>: los usuarios de la empresa, cada uno
            con su rol.
          </>,
          <>
            <strong>La primera obra</strong>: con sus fechas y su
            presupuesto (el capítulo siguiente).
          </>,
          <>
            <strong>Equipo, dentro de la obra</strong>: asignar a quienes la
            llevan. Sin este paso, el residente entra y no ve nada.
          </>,
        ]}
      />
      <p>
        El panel lleva la cuenta de estos preliminares y marca lo que ya
        está: no hay que recordarlos de memoria.
      </p>
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Dar de alta a un residente y no asignarle su obra",
            pasa: (
              <p>
                Entra y ve un panel sin obras. Es el comportamiento correcto
                —nadie le ha dado acceso—, pero se lee como avería si no se
                espera. La solución está en la obra: <em>Equipo → añadir</em>.
              </p>
            ),
          },
          {
            hace: "Repartir permisos a mano para un caso puntual",
            pasa: (
              <p>
                Un permiso que en la práctica siempre acompaña a otro acaba
                faltando un día. Antes de tocar la matriz, conviene
                preguntarse si lo que falta es un permiso o una asignación de
                obra: casi siempre es lo segundo.
              </p>
            ),
          },
          {
            hace: "Esperar que un usuario nuevo reciba avisos desde el primer día",
            pasa: (
              <p>
                Los avisos que suenan solos (recordatorios, resúmenes) se
                encienden por obra, en sus ajustes, y nacen apagados: empezar
                a insistirle a quien no lo pidió es la forma más rápida de
                que apague los avisos enteros.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: la obra y su presupuesto
// ---------------------------------------------------------------------------

const PRESUPUESTO = (
  <>
    <Clave>
      El presupuesto es un <strong>árbol</strong>: los capítulos agrupan y
      las partidas llevan el dinero. Todas las cifras de GCM —el
      comprometido, el avance valorizado, las alertas— cuelgan de ese árbol,
      así que importarlo bien es la media hora mejor invertida de toda la
      obra.
    </Clave>

    <S titulo="La idea: capítulos que suman, partidas que valen">
      <p>
        Una <strong>partida</strong> es trabajo con precio: «Concreto 210
        kg/cm² en zapatas, S/ 3,015». Un <strong>capítulo</strong> no lleva
        dinero propio: es la suma de sus partidas. Por eso GCM no deja
        imputar gasto a un capítulo — ese dinero no aparecería en ninguna
        partida y el control se descuadraría sin dar error.
      </p>
      <p>
        Hay un tercer caso: las filas de <strong>alcance</strong>, que
        detallan qué incluye una partida a suma alzada pero no llevan
        importe propio. Se les puede reportar avance, no gasto: su dinero
        vive en la partida madre.
      </p>
      <p>
        Cuando una cifra de la obra se calcula, GCM suma <strong>solo las
        hojas</strong> del árbol — nunca una partida y su capítulo a la vez.
        Es la regla que impide contar el mismo dinero dos veces, y explica
        por qué el total no es «la suma de todas las filas».
      </p>
    </S>

    <S titulo="La plantilla oficial, SIEMPRE">
      <p>
        El presupuesto entra por un archivo de Excel, y{" "}
        <strong>casi todos los fallos del importador nacen del archivo, no
        del sistema</strong>: celdas combinadas, filas de subtotal que
        repiten la suma de sus hijas, columnas movidas. Por eso cada pantalla
        de importación ofrece su <strong>plantilla oficial</strong> para
        descargar: úsala siempre, también cuando el presupuesto ya exista en
        otro formato — copiar los datos a la plantilla cuesta minutos;
        perseguir un total descuadrado, tardes.
      </p>
    </S>

    <S titulo="El recorrido de la primera vez">
      <Recorrido
        pasos={[
          <>
            <strong>Crear la obra</strong> con sus fechas y datos de ficha.
          </>,
          <>
            <strong>Descargar la plantilla</strong> del presupuesto, en la
            propia pantalla de importación.
          </>,
          <>
            <strong>Llenarla y cargarla.</strong> El importador enseña lo que
            entendió antes de guardar: es el momento de mirar el árbol, no
            después.
          </>,
          <>
            <strong>Revisar los totales</strong> contra el documento
            original. Si no cuadran, el problema está casi siempre en el
            archivo.
          </>,
          <>
            Cuando el presupuesto sea EL plan —no un borrador—,{" "}
            <strong>aprobar la línea base</strong>: congela la referencia
            contractual de la que cuelgan los movimientos (adicionales,
            deductivos, reconversiones). Es irreversible, y esa es su
            gracia: contra un plan que se reescribe no se puede medir nada.
          </>,
        ]}
      />
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Importar un Excel propio en vez de la plantilla",
            pasa: (
              <p>
                Celdas combinadas y filas-resumen que el ojo ignora pero el
                importador no. El síntoma típico: un total que dobla el real
                porque las filas de subtotal entraron como partidas.
              </p>
            ),
          },
          {
            hace: "Intentar borrar una partida que ya tiene vida",
            pasa: (
              <p>
                Una partida con avance reportado <strong>no se borra
                jamás</strong>: es la única constancia de trabajo ya
                ejecutado, y borrarla movería el avance de la obra hacia
                atrás sin que nadie haya deshecho nada en el mundo real. Con
                dinero comprometido encima (una orden, un encargo), el
                sistema también lo impide y dice quién la sujeta.
              </p>
            ),
          },
          {
            hace: "Aprobar la línea base tarde, con la obra empezada",
            pasa: (
              <p>
                Congela un plan que ya incorpora lo que salió mal, y desde
                ahí el atraso medido será siempre pequeño: te comparas
                contigo mismo. La línea base vale lo que valga el momento en
                que se fija.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: el dinero comprometido
// ---------------------------------------------------------------------------

const DINERO = (
  <>
    <Clave>
      En esta forma de trabajar no se compran materiales: se{" "}
      <strong>subcontrata un frente</strong> a un contratista «a todo riesgo»
      y se le paga a él. La cadena del dinero es{" "}
      <em>partida → contratista → valorización → pago</em>, y la pieza que
      manda es el <strong>encargo</strong>: el contrato marco. Las órdenes se
      emiten contra él.
    </Clave>

    <S titulo="Encargo y orden: quién pone el compromiso">
      <p>
        El <strong>encargo</strong> dice qué frente hace un contratista
        (qué partidas, y qué fracción de cada una), por cuánto —su{" "}
        <strong>monto contratado</strong>, sin IGV— y cómo valoriza. Desde
        que está vigente, ese monto ya es dinero comprometido: se firmó.
      </p>
      <p>
        La <strong>orden</strong> es el documento con el que ese contrato se
        va formalizando por partes (o una compra puntual, si no hay encargo
        detrás). Por eso el <strong>Comprometido</strong> de la obra suma{" "}
        <em>encargos vigentes + órdenes sueltas aprobadas</em>: una orden
        emitida contra un encargo <strong>no suma otra vez</strong> — su
        dinero ya lo puso el monto del encargo. El panel de órdenes separa
        siempre cuánto viene de cada origen.
      </p>
      <p>
        Ojo con una lectura tentadora: el monto contratado es{" "}
        <strong>el precio del contratista, no tu presupuesto</strong>. Puede
        quedar por encima o por debajo del parcial de tus partidas, y cada
        tarjeta lo enseña por separado («Contratado» contra «Tu
        presupuesto») justamente para que no se confundan.
      </p>
    </S>

    <S titulo="El recorrido de la primera vez">
      <Recorrido
        pasos={[
          <>
            <strong>Alta del contratista</strong> en <em>Mi constructora →
            Contratistas</em>, con su RUC y el impuesto que emite.
          </>,
          <>
            <strong>Crear el encargo</strong> en <em>Proveedores</em> (dentro
            de la obra): el frente —sus partidas, con la fracción de cada
            una—, el monto pactado y las fechas.
          </>,
          <>
            <strong>Emitir las órdenes contra el encargo</strong>: en el
            formulario de la orden, al elegir el proveedor aparece «Contra el
            encargo». La orden nace en borrador; al aprobarla queda
            formalizada. En la tarjeta del encargo se ve cuánto va
            formalizado y cuánto queda «por pedir».
          </>,
          <>
            <strong>El contratista valoriza</strong> su avance con la
            cadencia pactada, y de cada valorización salen los{" "}
            <strong>pagos</strong> con su comprobante (capítulo de
            valorizaciones).
          </>,
        ]}
      />
    </S>

    <S titulo="Cómo se reparte y contra qué cuenta">
      <p>
        Una orden real cruza varias partidas, así que su importe se{" "}
        <strong>imputa</strong> repartido entre ellas — y el reparto tiene
        que sumar exactamente la cifra que cuenta. Esa cifra depende del
        impuesto: con IGV se imputa el <strong>neto</strong> (el IGV es
        crédito fiscal, no costo de obra); con retención de renta, el{" "}
        <strong>total</strong> (lo retenido se paga igual, solo que a
        SUNAT). El formulario hace la cuenta en vivo y se niega a guardar un
        reparto descuadrado, diciendo cuánto sobra o falta.
      </p>
      <p>
        El monto de un encargo también se lee por partida: se reparte en
        proporción al trozo de presupuesto que el encargo toma de cada una,
        sin perder un céntimo por redondeo. Por eso el sobregiro —una
        partida comprometida por encima de su presupuesto—{" "}
        <strong>puede saltar al firmar el encargo</strong>, no recién al
        emitir órdenes: si pactaste caro, es mejor saberlo el primer día.
      </p>
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Emitir suelta una orden que era de un encargo",
            pasa: (
              <p>
                El mismo dinero cuenta dos veces: una por el monto del
                encargo y otra por la orden. Se ve en el desglose del panel
                («X de encargos + Y en órdenes sueltas», más alto de lo que
                debería). Se corrige anulando la orden —con su motivo— y
                reemitiéndola contra el encargo: quedan las dos huellas.
              </p>
            ),
          },
          {
            hace: "Leer el monto contratado como si fuera el presupuesto",
            pasa: (
              <p>
                Son dos cifras distintas por diseño: lo que cobra el
                contratista y lo que costaba en tu presupuesto. La tarjeta
                del encargo enseña la diferencia («vs contratado») — en
                positivo, el contratista cobra más de lo presupuestado, y esa
                conversación conviene tenerla antes de firmar.
              </p>
            ),
          },
          {
            hace: "Repartir el total del documento en una orden con IGV",
            pasa: (
              <p>
                Es el error más natural —el papel termina en el total— y el
                sistema lo rechaza diciendo cuánto sobra: justo el IGV. Si
                entrara, cada partida quedaría inflada un 18% y el
                comprometido dejaría de cuadrar con lo pactado de verdad.
              </p>
            ),
          },
          {
            hace: "Esperar que el CPI del valor ganado baje al firmar un encargo",
            pasa: (
              <p>
                No baja, y es a propósito: el costo del EVM (AC) cuenta las{" "}
                <strong>órdenes aprobadas</strong>, no los encargos — un
                contrato firmado es promesa de costo, y el costo entra a
                medida que las órdenes lo formalizan. El Comprometido y el AC
                responden preguntas distintas y por eso pueden diferir.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// El indice: los capitulos en el orden del trabajo real
// ---------------------------------------------------------------------------

export const CAPITULOS: CapituloManual[] = [
  {
    slug: "empezar",
    titulo: "Empezar: la empresa, las personas y quién ve qué",
    pregunta: "por dónde se empieza",
    paraQuien: "Todos; el recorrido inicial es del ADMIN.",
    resumen:
      "Los roles, el alcance por obra (por qué un usuario nuevo no ve " +
      "ninguna), y los preliminares de una constructora recién llegada.",
    contenido: EMPEZAR,
  },
  {
    slug: "presupuesto",
    titulo: "La obra y su presupuesto",
    pregunta: "cuánto cuesta",
    paraQuien: "Quien crea la obra y carga su presupuesto.",
    resumen:
      "El árbol de capítulos y partidas, la plantilla oficial de " +
      "importación, la regla que impide contar dinero dos veces y la línea " +
      "base.",
    contenido: PRESUPUESTO,
  },
  {
    slug: "cronograma",
    titulo: "El cronograma y el avance",
    pregunta: "cuándo se hace",
    paraQuien: "Quien planifica y quien reporta.",
    resumen:
      "Importar de MS Project por cortes, el avance real que manda sobre el " +
      "archivo, la curva S y los hitos.",
    contenido: null,
  },
  {
    slug: "meta",
    titulo: "El presupuesto meta",
    pregunta: "cuánto queremos gastar",
    paraQuien: "Gerencia y residencia.",
    resumen:
      "El contractual contra el meta: la bolsa operativa de la obra y sus " +
      "reglas.",
    contenido: null,
  },
  {
    slug: "lookahead",
    titulo: "El Lookahead",
    pregunta: "qué se prepara",
    paraQuien: "Residencia.",
    resumen:
      "Mirar unas semanas adelante, destapar restricciones y liberarlas " +
      "antes de comprometer nada.",
    contenido: null,
  },
  {
    slug: "plan-semanal",
    titulo: "El plan semanal",
    pregunta: "qué se compromete",
    paraQuien: "Residencia, con la cuadrilla delante.",
    resumen:
      "Comprometer solo lo liberado, cerrar la semana, y el PPC con sus " +
      "causas de no cumplimiento.",
    contenido: null,
  },
  {
    slug: "parte-del-dia",
    titulo: "El parte del día",
    pregunta: "cuánto se avanzó hoy",
    paraQuien: "Quien está en obra.",
    resumen:
      "Reportar avance por tarea con sus fotos: de aquí salen la curva S, " +
      "el valor ganado y el informe semanal.",
    contenido: null,
  },
  {
    slug: "dinero",
    titulo: "El dinero: encargos y órdenes",
    pregunta: "qué se ha pedido",
    paraQuien: "Quien contrata y quien controla el costo.",
    resumen:
      "El encargo como contrato marco, las órdenes que lo formalizan, el " +
      "comprometido sin dobles conteos y el sobregiro que avisa al firmar.",
    contenido: DINERO,
  },
  {
    slug: "valorizaciones",
    titulo: "Valorizaciones y pagos",
    pregunta: "a quién le toca y a quién se le debe",
    paraQuien: "Residencia y administración.",
    resumen:
      "La cadencia de cada contratista, el panel de lo que toca esta " +
      "semana, y el pago con su comprobante en PDF.",
    contenido: null,
  },
  {
    slug: "indicadores",
    titulo: "Leer la obra: tablero e indicadores",
    pregunta: "cómo va la obra",
    paraQuien: "Quien supervisa.",
    resumen:
      "El tablero de la obra, los semáforos, el valor ganado (SPI y CPI) y " +
      "qué significa cada rótulo — y cuándo una cifra calla a propósito.",
    contenido: null,
  },
  {
    slug: "gerencia",
    titulo: "Gerencia: la cartera de una mirada",
    pregunta: "cómo va la cartera",
    paraQuien: "Quien responde de todas las obras.",
    resumen:
      "Los adicionales pedidos y sin aprobar, el semáforo de partidas " +
      "críticas y el SPI por duración de cada obra.",
    contenido: null,
  },
  {
    slug: "avisos",
    titulo: "Los avisos y el reloj",
    pregunta: "qué suena solo",
    paraQuien: "Todos.",
    resumen:
      "La campanita, el correo y el SMS: qué avisa solo, por qué los " +
      "recordatorios nacen apagados y dónde se encienden por obra.",
    contenido: null,
  },
  {
    slug: "cierre",
    titulo: "Cerrar, respaldar y restaurar",
    pregunta: "lo que ya terminó",
    paraQuien: "ADMIN.",
    resumen:
      "Qué significa cerrar una obra, el respaldo completo, la restauración " +
      "para auditoría y lo único que no se borra jamás.",
    contenido: null,
  },
];

export function capituloPorSlug(slug: string): CapituloManual | null {
  return CAPITULOS.find((c) => c.slug === slug) ?? null;
}
