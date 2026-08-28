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

/**
 * Una tabla de dos o cuatro columnas, para lo que de verdad es una tabla: un
 * glosario, o una comparacion con cifras. NO para explicar: la prosa explica
 * mejor, y una tabla con parrafos dentro se lee peor que los parrafos solos.
 *
 * Se desplaza dentro de su propio contenedor: en un movil, una tabla de cuatro
 * columnas que empuje la pagina entera hace inservible el capitulo.
 */
function Tabla({
  cabeceras,
  filas,
}: {
  cabeceras: string[];
  filas: string[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {cabeceras.map((c) => (
              <th
                key={c}
                className="border-b px-2 py-1.5 text-left font-semibold"
                style={{ borderColor: "var(--borde)" }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={i}>
              {fila.map((celda, j) => (
                <td
                  key={j}
                  className="border-b px-2 py-1.5 align-top"
                  style={{ borderColor: "var(--borde)" }}
                >
                  {j === 0 ? <strong>{celda}</strong> : celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

    <S titulo="Qué toca ahora: el anclaje de cada obra">
      <p>
        Dentro de una obra, encima del contenido y en{" "}
        <strong>todas sus pantallas</strong>, GCM enseña{" "}
        <strong>un solo paso</strong>: el que toca ahora, con su botón. No es
        una lista —la lista larga vive en el tablero, en «Qué falta»—, porque
        algo que se repite en veinte pantallas tiene que caber en una línea o
        se deja de leer a la tercera.
      </p>
      <p>
        El orden no es caprichoso. Primero el{" "}
        <strong>alta de la obra</strong> —presupuesto, cronograma, equipo y
        línea base—, que es el único tramo donde encadenar pasos aporta de
        verdad: son cuatro y tienen final. Y por último lo que quedó a medias
        y ya venció: restricciones con la fecha pasada, semanas sin cerrar.
      </p>
    </S>

    <S titulo="Sugiere, no lleva — y se aparta si molesta">
      <p>
        <strong>Nunca navega solo</strong>, ni siquiera después de guardar
        algo: aprobar una revisión o un movimiento son irreversibles, y
        encadenarlos sin leer es exactamente lo que no se quiere enseñar.
        Tampoco propone lo que tú no puedes hacer —si no tienes permiso para
        importar el presupuesto, no te lo pide— y se esconde solo cuando ya
        estás en la pantalla del paso, para no robarte la primera línea
        mientras trabajas.
      </p>
      <p>
        Las sugerencias se apartan con <strong>«Ahora no»</strong>, que dura
        lo que la pestaña: aplazar es «ahora no», no «nunca más». La decisión
        bloqueante <strong>no se aparta</strong>, porque esconderla dejaría el
        margen mudo sin decir por qué. Y en una obra cerrada no aparece nada:
        es historia, y a la historia no le falta nada.
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
                Es el paso del alta que más se olvida, porque su síntoma
                aparece en la pantalla de <em>otra</em> persona y quien lo
                omite no lo nota: por eso el anclaje de la obra lo dice con
                todas las letras («Nadie tiene asignada esta obra»).
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
      así que cargarlo bien es la media hora mejor invertida de toda la
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

    <S titulo="Cómo está contratada: precios unitarios o suma alzada">
      <p>
        Cada partida se registra de una de las dos formas, y no es una etiqueta
        informativa: cambia qué se teclea, qué se calcula solo y qué pasa
        cuando lo ejecutado no coincide con lo previsto.
      </p>
      <Tabla
        cabeceras={["", "Precios unitarios", "Suma alzada"]}
        filas={[
          ["Qué se escribe", "Metrado y precio unitario", "El importe cerrado"],
          ["El importe", "Se calcula: metrado × precio", "Se teclea; no se calcula"],
          ["El metrado", "Manda: se mide y se valoriza", "Referencial"],
          ["Si se ejecuta más", "El costo sube", "El importe no cambia"],
          ["Quién asume el riesgo", "El cliente", "El contratista"],
        ]}
      />
      <p>
        Al añadir una partida, el selector <strong>«Cómo está contratada»</strong>{" "}
        cambia el formulario: en suma alzada desaparece el precio unitario y
        aparece <strong>«Importe cerrado»</strong>. Los dos campos no se enseñan
        a la vez a propósito — invitaría a rellenarlos y a esperar que cuadren.
      </p>
      <p>
        Se puede corregir después: la columna <strong>Modalidad</strong> de la
        tabla del presupuesto lleva un desplegable.
      </p>

      <p className="font-medium">Al cargar un Excel, GCM lo deduce solo</p>
      <Tabla
        cabeceras={["Lo que trae la fila", "Cómo queda registrada"]}
        filas={[
          ["Importe, pero falta el metrado o el precio unitario", "Suma alzada"],
          ["Los tres, pero el importe NO es metrado × precio", "Suma alzada"],
          ["Unidad global: glb, global, glg", "Suma alzada"],
          ["Metrado, sin importe ni precio", "Alcance"],
          ["Metrado y precio que explican el importe", "Precios unitarios"],
        ]}
      />
      <p>
        El segundo caso es el que más aparece en los presupuestos reales. Si el
        archivo dice <em>metrado 1 × precio 5.000 = 4.800</em>, GCM{" "}
        <strong>respeta los 4.800 del documento</strong> y avisa de que no
        cuadra con la multiplicación. Recalcularlo sobrescribiría un precio ya
        pactado — y en un presupuesto real eso movía varios millones.
      </p>

      <p className="font-medium">El tercer caso: las filas de alcance</p>
      <p>
        Debajo de una partida a suma alzada suelen ir líneas que{" "}
        <strong>describen qué incluye</strong> el precio: llevan metrado para
        detallar el alcance, pero no importe propio — su dinero vive en la
        partida de arriba. Se les puede reportar avance, no gasto.
      </p>
      <p>
        Y <strong>no bajan a la EDT</strong>: describen, no son trabajo que
        programar. La tarea del cronograma es la partida a suma alzada, que es
        la que lleva el precio.
      </p>
    </S>

    <S titulo="El contractual sale del real, no al revés">
      <p>
        Desde agosto de 2026 el orden es este: primero entra el{" "}
        <strong>presupuesto meta</strong> —lo que de verdad cuesta ejecutar
        la obra— y de él se <strong>genera</strong> el contractual, inflando
        cada capítulo por un porcentaje de recargo. Antes se hacía al revés,
        y obligaba a tener un contractual aprobado para poder empezar.
      </p>
      <p>
        El recargo se escribe en la <strong>misma plantilla del real</strong>,
        en su columna, capítulo por capítulo. Ahí es donde se decide el
        margen: la bolsa operativa no es una cifra que se calcule después,
        es la que se pone aquí.
      </p>
    </S>

    <S titulo="La plantilla oficial, SIEMPRE">
      <p>
        El presupuesto entra por un archivo de Excel, y{" "}
        <strong>casi todos los fallos del importador nacen del archivo, no
        del sistema</strong>: celdas combinadas, filas de subtotal que
        repiten la suma de sus hijas, columnas movidas. Por eso la pantalla
        de <strong>Meta</strong> ofrece la <strong>plantilla oficial</strong>
        {" "}para descargar —y el cronograma la suya—: úsala siempre, también
        cuando el presupuesto ya exista en otro formato. Copiar los datos a
        la plantilla cuesta minutos; perseguir un total descuadrado, tardes.
      </p>
    </S>

    <S titulo="El recorrido de la primera vez">
      <Recorrido
        pasos={[
          <>
            <strong>Crear la obra</strong> con sus fechas y datos de ficha.
          </>,
          <>
            <strong>Cargar el presupuesto meta</strong>, con su
            plantilla oficial. En esa misma hoja va el{" "}
            <strong>% de recargo</strong> de cada capítulo.
          </>,
          <>
            <strong>Generar el contractual</strong> desde el real. La
            pantalla enseña las tres cifras —real, contractual y bolsa— y
            avisa de lo que no pudo recargar antes de escribir nada.
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
// Capitulo: el cronograma y el avance
// ---------------------------------------------------------------------------

const EDT = (
  <>
    <S titulo="El presupuesto ya es la EDT">
      <Clave>
        <strong>No se arma dos veces.</strong> La estructura de desglose del
        trabajo no se teclea aparte del presupuesto: <em>es</em> el
        presupuesto. El capítulo es la rama, la partida costeada es el paquete
        de trabajo y sus subpartidas son las tareas. Lo único que se añade
        encima son las <strong>fechas</strong>.
      </Clave>
      <p>
        Escribir la misma estructura en dos sitios —una en el presupuesto y
        otra en el cronograma— garantiza que algún día discrepen, y entonces
        nadie sabe cuál manda. Aquí se escribe una vez.
      </p>
      <p>La equivalencia, línea por línea:</p>
      <Tabla
        cabeceras={["En el presupuesto", "En la EDT", "Lleva fecha"]}
        filas={[
          ["CAPÍTULO IV: Estructuras", "Rama", "No: la hereda"],
          ["4.01 Concreto en zapatas (con precio)", "Paquete de trabajo, el entregable", "No: la hereda"],
          ["4.01.01 Encofrado", "Tarea", "Sí"],
          ["4.01.02 Acero", "Tarea", "Sí"],
          ["4.01.03 Vaciado", "Tarea", "Sí"],
        ]}
      />
      <p>
        Un paquete toma el inicio de su primera tarea y el fin de la última, y
        un capítulo lo mismo respecto a sus paquetes. Así cada fecha vive en un
        solo sitio y no puede contradecirse a sí misma.
      </p>
    </S>

    <S titulo="Cómo se numera">
      <p>
        La jerarquía sale del <strong>código</strong>, no de ningún campo
        aparte: cada punto es un nivel. <code>4</code> es capítulo,{" "}
        <code>4.01</code> cuelga de él, <code>4.01.02</code> cuelga de{" "}
        <code>4.01</code>. No hay límite práctico de profundidad.
      </p>
      <p>
        Se admiten las <strong>dos convenciones</strong> que conviven en los
        presupuestos peruanos, y dibujan el mismo árbol:
      </p>
      <Tabla
        cabeceras={["Forma", "Ejemplo", "Qué es"]}
        filas={[
          ["Nivel por punto", "7.01 · 7.01.01", "El subcapítulo tiene un segmento menos que sus partidas"],
          ["Cabecera en cero", "7.02.00 · 7.02.01", "El cero final marca que encabeza al grupo 7.02"],
        ]}
      />
      <p>
        <code>7.02.00</code> y <code>7.02.01</code> tienen los mismos tres
        números, pero el cero final delata que la primera es la cabecera: se
        coloca <strong>un escalón por encima</strong> de las{" "}
        <code>7.02.xx</code>, igual que <code>7.01</code>.
      </p>
    </S>

    <S titulo="La regla de oro: el dinero decide">
      <Clave>
        <strong>Quien es paquete de trabajo lo decide el importe, no la forma
        del árbol.</strong> Una fila con precio y sin ninguna descendiente con
        precio es un paquete: lleva fecha, se puede comprometer en el plan
        semanal y valoriza. Todo lo demás agrupa.
      </Clave>
      <p>
        Parece un detalle y no lo es. Si se llamara «paquete» a «la que no tiene
        subpartidas colgando», dos casos habituales saldrían mal:
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Una partida a suma alzada con su alcance detallado debajo.</strong>{" "}
          El precio está arriba y las subpartidas solo describen qué entra en
          él. La forma diría que las tareas son esas subpartidas sin cifra; el
          dinero dice que el paquete es la de arriba. GCM deja fuera de la EDT
          las líneas de alcance: describen, no se ejecutan.
        </li>
        <li>
          <strong>Una partida con un descuento comercial colgando.</strong> El
          descuento es negativo y no sustituye a la partida: la ajusta. Las dos
          siguen contando.
        </li>
      </ul>
      <p>
        La consecuencia práctica: <strong>una partida costeada nunca queda
        marcada como resumen</strong>. Si lo estuviera, saldría de la
        valorización, del plan semanal y de la curva — sin dar ningún error.
      </p>
    </S>

    <S titulo="Hasta dónde descomponer">
      <p>
        La pregunta que más se repite. El criterio no es teórico:
      </p>
      <Recorrido
        pasos={[
          <>
            <strong>Baja un nivel más si no puedes medir el avance</strong> de
            esa línea con una sola cifra. «Estructuras» no se mide; «vaciado de
            zapatas, 12 m³» sí.
          </>,
          <>
            <strong>Baja un nivel más si no puedes poner un solo
            responsable.</strong> Si el encofrado lo hace un frente y el acero
            otro, son dos tareas.
          </>,
          <>
            <strong>Para cuando la línea dure menos de lo que dura tu semana
            de planificación.</strong> Descomponer por debajo de eso llena el
            plan semanal de ruido y nadie lo mantiene.
          </>,
          <>
            <strong>Para cuando el precio deja de tener sentido propio.</strong>{" "}
            Si tienes que inventar cómo repartir un precio entre dos líneas, esas
            dos líneas son una.
          </>,
        ]}
      />
      <p>
        En obra de edificación, lo normal son tres niveles: capítulo,
        subcapítulo por frente o por piso, y partida. Cuatro cuando hay varias
        zonas.
      </p>
    </S>

    <S titulo="Qué hace GCM con esto">
      <Recorrido
        pasos={[
          <>
            <strong>Cargas el presupuesto</strong>, con la plantilla o con tu
            propio Excel. Cada capítulo enseña lo que suman sus partidas.
          </>,
          <>
            <strong>Generas la EDT desde el presupuesto</strong> — en el
            cronograma, si la obra no trae uno de Project. Trae la estructura y
            el enlace con el dinero, pero <strong>ninguna fecha</strong>: esas
            tareas quedan marcadas «sin programar», no alertan y no mueven
            ningún índice hasta que alguien las programe. Una fecha de relleno
            no es un plan, y el sistema no finge que lo sea.
          </>,
          <>
            <strong>Pones las fechas en las tareas.</strong> Solo en las hojas:
            los paquetes y los capítulos las heredan solos.
          </>,
          <>
            <strong>El presupuesto sigue vivo y la EDT lo sigue.</strong> Al
            añadir o corregir partidas, la estructura del cronograma se pone al
            día sola, sin pulsar nada. Lo que ya tiene avance no se toca, y lo
            que no se puede decidir solo se rechaza entero y se explica.
          </>,
        ]}
      />
      <p>
        La EDT se genera sobre un cronograma <strong>vacío</strong>. Si ya hay
        uno con plan —importado de Project o tecleado—, mezclar filas generadas
        con filas escritas deja una estructura que nadie puede leer; para eso
        está la puesta al día, que va aparte y con su propia regla.
      </p>
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Poner el importe en el capítulo Y en sus partidas",
            pasa: (
              <>
                Es el error más caro del presupuesto. GCM lo resuelve —cuenta la
                partida y anula al capítulo, porque la hija manda sobre la
                madre—, así que el total sale bien. Pero el papel del que
                copiaste miente: si el cliente aprueba un monto que suma las dos
                cosas, la obra nace con una bolsa que no existe.
              </>
            ),
          },
          {
            hace: "Descomponer hasta la última actividad",
            pasa: (
              <>
                Una EDT con seiscientas líneas no se mantiene: nadie actualiza
                el avance de todas, el plan semanal se vuelve ilegible y el PPC
                deja de medir nada. Si una línea dura menos que tu semana de
                planificación, sobra.
              </>
            ),
          },
          {
            hace: "Dejar partidas sin precio esperando ponerlo después",
            pasa: (
              <>
                Sin importe no son paquetes de trabajo, así que{" "}
                <strong>no bajan a la EDT</strong> y no aparecen en el
                cronograma. Es correcto —no se programa lo que no está
                costeado—, pero conviene saberlo: si cargaste solo la estructura,
                pon los precios antes de generar la EDT.
              </>
            ),
          },
          {
            hace: "Reordenar el presupuesto cuando la obra ya avanza",
            pasa: (
              <>
                Cambiar el código de una partida cambia de quién cuelga. La
                puesta al día respeta lo que ya tiene avance, pero una partida
                que desaparece del presupuesto deja su tarea como{" "}
                <strong>sobrante</strong>: no se borra, se nombra, para que
                alguien decida.
              </>
            ),
          },
        ]}
      />
    </S>
  </>
);

const CRONOGRAMA = (
  <>
    <Clave>
      El plan lo fija el cronograma; el avance real lo pone GCM. El cronograma entra
      por <strong>cortes</strong> —cada semana se carga el archivo con el
      plan al día— y el avance que se reporta en obra{" "}
      <strong>vive aparte y sobrevive</strong> a cada corte nuevo. De ese
      cruce salen la curva S, las alertas de atraso y el valor ganado.
    </Clave>

    <S titulo="Cortes, versiones y el ancla que no cambia">
      <p>
        Cada importación es un <strong>corte</strong> con su fecha: la foto
        del plan tal como estaba esa semana. GCM guarda la serie entera —por
        eso la curva S puede contar la historia— y trabaja siempre sobre el
        corte vigente, el más reciente.
      </p>
      <p>
        Cada tarea trae del archivo un <strong>identificador estable (su
        uid)</strong>, y es el ancla de todo lo que GCM le cuelga: el avance
        reportado, las fotos, los hitos, el Lookahead. Es lo único del
        archivo que no cambia entre semanas — el número de fila se corre al
        insertar, el código se recalcula y el nombre se edita. Por eso
        reimportar no pierde el trabajo hecho… mientras la tarea siga
        existiendo en Project.
      </p>
      <p>
        Del archivo se <strong>lee</strong> el % planeado de cada fila (así
        las cifras cuadran con el informe que ya se emite); el % real, en
        cambio, <strong>lo manda lo reportado en GCM</strong> — el
        porcentaje del archivo solo siembra la primera vez, para que un
        cronograma recién importado no se vea entero a cero.
      </p>
    </S>

    <S titulo="La curva S y la ponderación">
      <p>
        La curva compara lo planeado con lo medido en cada corte, y cada
        tarea pesa <strong>según su duración</strong>: terminar una partida
        de un día no es lo mismo que terminar una de veinte. GCM no pondera
        por dinero hoy, con cualquier cobertura de mapeo tarea-partida —el
        mapeo sí decide qué tan fiables son el CPI y sus proyecciones (EAC,
        VAC), que son cifras de dinero, no de duración.
      </p>
      <p>
        La <strong>línea base del cronograma</strong> congela contra qué se
        miden el plan (PV) y el índice de plazo (SPI): sin ella, te comparas
        contra el último corte que subiste — contra ti mismo. A diferencia
        de la revisión del presupuesto, esta sí se puede re-fijar: fijar
        otra versión limpia la anterior.
      </p>
    </S>

    <S titulo="El recorrido de cada semana">
      <Recorrido
        pasos={[
          <>
            <strong>Exportar de MS Project</strong> el plan al día (o usar
            la plantilla de Excel del cronograma, si la obra no usa
            Project).
          </>,
          <>
            <strong>Cargar el corte</strong> en la pantalla del cronograma.
            El importador enseña qué entendió; las tareas conservan su
            avance porque el ancla es el uid.
          </>,
          <>
            <strong>Marcar los hitos</strong> que merecen aviso —las fechas
            clave— con su responsable: el reloj avisará cuando se acerquen o
            se pasen, con la fecha del cronograma vigente.
          </>,
          <>
            El avance del día a día ya no se toca aquí:{" "}
            <strong>entra por el parte del día</strong> y por el cierre del
            plan semanal, y la curva lo recoge solo.
          </>,
        ]}
      />
      <p>
        ¿La obra aún no usa Project? La EDT se puede{" "}
        <strong>generar desde el presupuesto</strong>: trae la estructura y
        el dinero, pero ninguna fecha — esas filas quedan marcadas «sin
        programar» y no alertan ni mueven índices hasta que alguien las
        programe. Sus fechas de relleno no son un plan, y GCM las trata
        así.
      </p>
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Borrar o rehacer tareas en Project entre corte y corte",
            pasa: (
              <p>
                Si la tarea desaparece del archivo, su avance reportado queda
                huérfano — GCM lo aparta y lo enseña en vez de borrarlo,
                porque es trabajo que alguien hizo y reportó. Pasó de verdad:
                una partida al 100% desapareció del archivo entre dos
                semanas. Antes de borrar en Project, conviene saber qué hay
                colgado de esa tarea.
              </p>
            ),
          },
          {
            hace: "Poner una tarea de trabajo con duración cero",
            pasa: (
              <p>
                Project la trata como hito, y un hito no lleva peso ni
                dinero: la partida sale de las cuentas sin dar error. Si es
                trabajo, que dure; si es una fecha, que sea hito con nombre y
                responsable.
              </p>
            ),
          },
          {
            hace: "Fijar la línea base del cronograma con la obra ya atrasada",
            pasa: (
              <p>
                El plan congelado ya incorpora el atraso y el SPI saldrá
                cómodo para siempre. Se puede re-fijar —esta sí—, pero cada
                re-fijado mueve el listón: la pantalla dice contra qué
                versión se está midiendo, y conviene leerlo antes de
                celebrar un 1.00.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: el presupuesto meta
// ---------------------------------------------------------------------------

const META = (
  <>
    <Clave>
      Aquí entra el presupuesto <strong>real</strong>: lo que tu empresa se
      compromete a gastar para ejecutar la obra. Es el primer paso, y de él
      sale el <strong>contractual</strong> —lo que el cliente paga— inflando
      cada capítulo por un porcentaje de recargo. La distancia entre los dos
      es la <strong>bolsa operativa</strong>: el margen con el que la obra
      respira. Sin meta, «vamos bien de plata» es una opinión.
    </Clave>

    <S titulo="Dos presupuestos con reglas distintas, a propósito">
      <p>
        El <strong>contractual</strong> se congela con su revisión y es
        irreversible: una vez firmado es un contrato, y los cambios van
        encima como adicionales o deductivos. La <strong>meta</strong>{" "}
        también se aprueba y se congela… pero se puede{" "}
        <strong>re-fijar creando una versión nueva</strong>. No es un
        descuido: la meta es una promesa interna, y cuando el alcance cambia
        —llega un adicional, se reconvierte una partida— una meta que no
        pudiera rehacerse quedaría desfasada para siempre y la bolsa
        exageraría sin remedio.
      </p>
      <p>
        Cada versión de la meta recuerda, cuando lo hay, contra qué
        contractual se fijó y cuántos movimientos había entonces: si después
        entran más, la pantalla avisa del desfase — es la señal de que toca
        re-fijar. Una meta puede nacer sin contractual: es lo normal ahora,
        porque el contractual se genera a partir de ella.
      </p>
    </S>

    <S titulo="Los sueldos también son costo de la obra">
      <p>
        La meta es <strong>todo lo que hay que pagar</strong>: las partidas que
        se ejecutan y también lo que cuesta la obra sin ser una partida —el
        residente, el maestro, la camioneta, las cartas fianza, las pólizas—.
        Van en la misma hoja, en las filas <strong>sin Ítem</strong>, y por eso
        no se le desglosan al cliente: el contrato los reconoce englobados, no
        sueldo a sueldo. Cuestan igual, y la bolsa se mide contra el total.
      </p>
      <p>
        Hasta el 23 de agosto de 2026 vivían en una hoja aparte, y esa hoja
        podía valer cero sin que nada avisara: una obra que perdía S/ 300 decía
        perder S/ 200, porque el sueldo del residente estaba escrito en el
        Excel y no contaba. Una sola lista y una sola suma; no hay dos cuentas
        que puedan discrepar.
      </p>
      <p>
        La <strong>utilidad</strong> sigue sin entrar, y eso no cambia: no es
        un costo que se pueda gastar, es el resultado.
      </p>
    </S>

    <S titulo="Lo que se paga por mes va en «mes»">
      <p>
        Una fila sin Ítem con la unidad en <strong>mes</strong> le dice a GCM
        que ese costo <strong>crece si la obra se alarga</strong>: el metrado
        son los meses y el precio unitario es lo que cuesta cada mes. De ahí
        sale la única cifra que convierte «vamos tres semanas tarde» en dinero.
      </p>
      <p>
        Un sueldo escrito como <strong>8 × 6 500</strong> dice lo que cuesta
        estirarse. Escrito como <strong>52 000</strong> a secas no dice nada, y
        un importe cerrado no se puede repartir hacia atrás. Lo que no depende
        del plazo —fianzas, pólizas, licencias— va con unidad
        <strong>glb</strong>.
      </p>
      <p>
        Los meses son <strong>por línea</strong>, no el plazo de la obra: nadie
        está en obra todo el plazo. Con un único número global el costo saldría
        siempre de más.
      </p>
    </S>

    <S titulo="El recorrido de la primera vez">
      <Recorrido
        pasos={[
          <>
            <strong>Cargar el presupuesto meta</strong> con la plantilla
            oficial, y revisar los totales: costo directo, costos propios y
            plazo en meses. Es el PRIMER paso de la obra: ya no hace falta
            tener un contractual aprobado antes, porque el contractual sale
            justo de aquí.
          </>,
          <>
            <strong>Poner el % de recargo</strong> a cada capítulo, en la
            columna que trae la misma plantilla. Es lo que separa el real del
            contractual, y por tanto lo que fija la bolsa antes de que exista.
          </>,
          <>
            <strong>Generar el contractual</strong> desde el real. GCM infla
            cada capítulo por su recargo y arma con eso el árbol de partidas
            contra el que se mide la obra. Antes de confirmar enseña las tres
            cifras —real, contractual y bolsa— y avisa de lo que no pudo
            recargar.
          </>,
          <>
            <strong>Aprobarla</strong> para congelarla. Desde ahí la bolsa
            se lee sola: contractual vigente contra meta.
          </>,
        ]}
      />
    </S>

    <S titulo="Si hay que gastar menos, se pide y lo firma gerencia">
      <p>
        La meta está congelada, y eso es lo que permite ver la desviación: si
        se pudiera bajar cuando la bolsa se pone fea, el plan se reescribiría
        para encajar con la realidad y siempre parecería que se va justo. Pero
        a veces <strong>de verdad se va a gastar menos</strong>: el andamio se
        devuelve dos meses antes, la cuadrilla de apoyo se desmonta.
      </p>
      <p>
        Para eso está la <strong>deducción de un costo propio</strong>. La pide
        el residente o el administrador de obra desde la pantalla de la meta, y
        la <strong>firma gerencia</strong>. Aprobada, ese dinero vuelve a la
        bolsa — y la meta <strong>sigue sin tocarse</strong>: la pantalla
        enseña las dos cifras, lo presupuestado y lo que queda, para que dentro
        de seis meses se sepa que hubo una decisión y quién la firmó. Es la
        misma relación que hay entre el presupuesto contractual congelado y sus
        movimientos aprobados.
      </p>
      <p>
        <strong>Solo de un costo propio</strong>, nunca de una partida. Un
        costo propio es una decisión de la empresa — cuántos meses se alquila
        algo — y por eso se puede decidir gastar menos. El costo de una partida
        lo dicta la obra: bajarlo no sería decidir nada, sería reescribir el
        plan para que cuadre.
      </p>
      <p>
        Y el <strong>motivo es obligatorio</strong>: una deducción no es dinero
        encontrado, es un compromiso de no gastarlo. Alguien tiene que poder
        comprobar después que se cumplió.
      </p>
    </S>

    <S titulo="Lo que cobra el contratista de cada capítulo">
      <Clave>
        Un capítulo subcontratado <strong>no cuesta lo que suman sus
        partidas</strong>. El contratista rebaja un porcentaje y, sobre el
        importe ya descontado, suma sus gastos generales y su utilidad. Eso es
        lo que hay que pagarle, y ese es el costo real del capítulo.
      </Clave>
      <p>La cascada, con un ejemplo:</p>
      <Tabla
        cabeceras={["Concepto", "Importe"]}
        filas={[
          ["Partidas cotizadas", "20.000,00"],
          ["− 5 % de descuento", "−1.000,00"],
          ["+ 8 % de gastos generales", "+1.520,00"],
          ["+ 10 % de utilidad", "+1.900,00"],
          ["TOTAL de su cotización, y lo que se le paga", "22.420,00"],
        ]}
      />
      <p>
        Los dos márgenes se calculan <strong>sobre el importe ya
        descontado</strong>, no uno encima del otro. Es la convención del
        formato peruano, y la diferencia no es pequeña: encadenarlos daría
        22.572 en lugar de 22.420.
      </p>

      <p className="font-medium">Dónde se pone</p>
      <p>
        En la <strong>fila del capítulo</strong>, con el botón del apretón de
        manos. Si un capítulo lo cubren dos o tres contratistas,{" "}
        <strong>cada uno en su subcapítulo</strong> con los suyos: manda el más
        cercano, así que no se pisan.
      </p>
      <p>
        También se puede traer desde el Excel: la plantilla tiene tres columnas
        —<strong>% Dcto</strong>, <strong>% GG</strong> y{" "}
        <strong>% Utilidad</strong>— y la hoja enseña el neto en la cabecera
        del capítulo, para compararlo de un vistazo con el total de la
        cotización.
      </p>

      <p className="font-medium">Qué hace GCM con eso</p>
      <p>
        <strong>Lo reparte entre las partidas del capítulo.</strong> Cada una
        pasa a valer lo que de verdad cuesta, y por eso las valorizaciones
        llegan al 100 % de lo pactado: si las partidas se quedaran en el precio
        de cotización, terminar el capítulo entero sumaría 20.000 cuando se
        deben 22.420.
      </p>
      <p>
        El <strong>metrado y el precio del contratista no se tocan</strong>: son
        los que se comparan en obra. Lo que cambia es el importe.
      </p>
      <p>
        Y <strong>no aparece ninguna tarea nueva en el cronograma</strong>. Un
        descuento no es trabajo que ejecutar, es precio.
      </p>

      <p className="font-medium">No se confunde con el recargo al cliente</p>
      <p>
        Son <strong>dos cascadas encadenadas</strong> y miran a lados opuestos.
        Primero se sabe lo que cuesta —lo que cobra el contratista— y solo
        después lo que se cobra —el recargo del capítulo, que genera el
        contractual—. Siguiendo el ejemplo, con un 20 % de recargo:
      </p>
      <Tabla
        cabeceras={["", "Importe"]}
        filas={[
          ["Suma de sus partidas", "20.000,00"],
          ["Total de su cotización, que es lo que se le paga", "22.420,00"],
          ["Lo que se le cobra al cliente", "26.904,00"],
        ]}
      />
      <p className="opacity-70">
        Ojo con el primer renglón: los 20.000 <strong>no son lo que cotiza el
        contratista</strong>, son solo la suma de sus partidas. Su cotización
        termina en 22.420, y eso es exactamente lo que se le va a pagar. Lo que
        GCM hace es repartir esa diferencia entre las partidas, para que el
        avance de cada una valorice sobre el precio de verdad.
      </p>

      <p className="font-medium">Cambiarlo después</p>
      <p>
        Se puede corregir cuando se quiera, sin volver al Excel. Al cambiar un
        porcentaje, GCM <strong>rehace la cuenta desde el precio de la
        cotización</strong>, no desde el importe ya ajustado — así corregir un
        5 % a un 7 % da lo mismo que haberlo puesto al 7 % desde el principio.
        Y quitando los tres, las partidas vuelven exactamente a lo que cotizó
        el contratista.
      </p>
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Usar la deducción para cuadrar la bolsa",
            pasa: (
              <p>
                Deducir «para que salga» sin que nadie vaya a dejar de gastar
                nada convierte la bolsa en un número que se ajusta a voluntad,
                y entonces deja de servir para decidir. Por eso hay dos firmas
                y por eso el motivo es obligatorio: lo que se firma es el
                compromiso, no la cifra.
              </p>
            ),
          },
          {
            hace: "Dejar la meta congelada mientras entran adicionales",
            pasa: (
              <p>
                El contractual crece y la meta no: la bolsa engorda sola y
                se lee como holgura que no existe. El desfase se enseña en
                pantalla; la respuesta es re-fijar la meta, que para eso es
                la única congelada que puede rehacerse.
              </p>
            ),
          },
          {
            hace: "Escribir un sueldo como un importe cerrado",
            pasa: (
              <p>
                Poner «Residente — 52 000» en vez de «8 meses × 6 500» suma
                igual, pero deja a GCM sin saber qué cuesta cada mes de más. El
                día que la obra se estira, el sobrecosto no aparece por ninguna
                parte y solo se descubre en el cierre. Unidad «mes», metrado =
                meses, precio = lo que se paga al mes.
              </p>
            ),
          },
        ]}
      />
    </S>

    <S titulo="Traerte un presupuesto que ya tienes en tu propio Excel">
      <p>
        No hace falta rehacerlo en nuestra plantilla. Al subir el archivo —al
        crear la obra o en la pantalla de la meta— hay una casilla:{" "}
        <strong>«Cargar solo la estructura, sin precios»</strong>. Con ella se
        traen los <strong>capítulos, partidas, subpartidas y sus
        descripciones</strong>, con la unidad y la cantidad si están, y{" "}
        <strong>ningún precio ni importe</strong>, aunque el archivo los traiga.
        Los precios se ponen después, aquí dentro.
      </p>
      <p>
        Se pregunta en vez de adivinarse: desde fuera no hay forma de saber si
        un Excel es nuestra plantilla o el presupuesto de otra oficina. Y sirve
        para las dos cosas que suelen fallar al traer un presupuesto ajeno:
      </p>
      <ul>
        <li>
          <strong>No heredas sus cuentas.</strong> En un presupuesto real que
          se probó, el propio Excel dejaba subcapítulos enteros fuera de sus
          totales —les faltaba la fórmula— y no restaba sus descuentos
          comerciales. Si no se trae ninguna cifra, no hay ninguna que pueda
          discrepar.
        </li>
        <li>
          <strong>Entra aunque no tenga precios.</strong> Sin la casilla, una
          fila sin cantidad ni precio se lee como un título —es la convención
          de los presupuestos de S10— y un título no admite importe: el
          presupuesto entraba entero como capítulos y no había forma de
          valorizarlo.
        </li>
      </ul>
      <p>
        Tampoco es un error que a una partida le falten la unidad o la
        cantidad. En este modo falta todo a propósito.
      </p>
      <p>
        <strong>Una meta cuyo costo es cero no se puede aprobar.</strong>{" "}
        Aprobar es lo que la congela, y sin un solo precio la bolsa saldría
        igual al contrato entero: un margen perfecto inventado.
      </p>
    </S>

    <S titulo="Ordenar el árbol: mover líneas y renumerar">
      <p>
        Un presupuesto que llega de fuera trae la jerarquía en la{" "}
        <strong>maqueta</strong> —sangrías, negritas, una fila «PRIMER PISO»
        encima de tres bloques— y no siempre en la numeración. En un caso real,
        <code>7.01.00 PRIMER PISO</code> agrupaba en el papel a{" "}
        <code>7.02.00 REDES DE DESAGUE</code>, pero por código eran hermanos:{" "}
        <code>7.01</code> y <code>7.02</code> están al mismo nivel. GCM solo
        puede fiarse de los números, así que dibuja ese árbol y no el de la
        obra.
      </p>
      <p>
        Se arregla dentro, con las <strong>cuatro flechas</strong> de cada
        línea del borrador:
      </p>
      <ul>
        <li>
          <strong>↑ y ↓</strong> — mueven la línea entre sus hermanas. Se
          llevan consigo todo lo que tenga dentro: mover un capítulo sin sus
          partidas las dejaría colgando de quien quede encima, que es cambiar
          de sitio dinero ajeno.
        </li>
        <li>
          <strong>→</strong> — la mete dentro de la línea de arriba. Es la que
          resuelve el caso de «PRIMER PISO».
        </li>
        <li>
          <strong>←</strong> — la saca un nivel hacia fuera.
        </li>
      </ul>
      <p>
        Después de cada movimiento <strong>se renumera todo</strong>: 1, 1.01,
        1.01.01, 2… No se renumera solo lo movido porque el código ES la
        posición en el árbol, y en cuanto algo cambia de sitio los demás dejan
        de describirlo. Por eso los códigos no se teclean: salen solos.
      </p>
      <p>
        <strong>Es capítulo lo que tiene algo dentro</strong>, y solo eso. Por
        eso no hay un botón de «crear capítulo»: se añade una línea y se le
        mete algo debajo. Y por eso, cuando una partida con importe pasa a
        tener hijas, <strong>pierde su importe</strong> —un capítulo vale la
        suma de los suyos— y la pantalla lo dice en ese momento.
      </p>
      <p>
        <strong>Borrar un capítulo no borra lo que tiene dentro:</strong> sus
        partidas suben un nivel y se renumera. Llevarse veinte partidas por
        delante en un clic no se puede deshacer y nadie lo espera.
      </p>
      <p>
        Todo esto es sobre el <strong>borrador</strong>. Una meta aprobada está
        congelada: para cambiarla se carga una versión nueva.
      </p>
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: el Lookahead
// ---------------------------------------------------------------------------

const LOOKAHEAD = (
  <>
    <Clave>
      El Lookahead mira las <strong>próximas semanas</strong> del cronograma
      y hace una sola pregunta por tarea: ¿qué le falta para poder
      ejecutarse? Cada falta es una <strong>restricción</strong> con nombre
      y fecha comprometida, y la regla del Last Planner es simple:{" "}
      <strong>al plan semanal solo entra lo liberado</strong>. Comprometer
      trabajo con restricciones abiertas es prometer lo que no depende de
      ti.
    </Clave>

    <S titulo="De dónde salen las tareas (y de dónde no)">
      <p>
        Las tareas del Lookahead <strong>no se crean a mano</strong>: se
        derivan del cronograma vigente — las de trabajo cuyo rango toca la
        ventana de las próximas semanas, ancladas por el mismo uid que el
        avance. Así el mediano plazo no puede contradecir al plan: es el
        plan, mirado de cerca.
      </p>
      <p>
        Las restricciones tampoco se siembran solas. Quien analiza la tarea
        marca cuáles de los <strong>siete flujos</strong> le aplican
        —información, materiales, mano de obra, equipos, prerrequisitos,
        espacio, permisos— <strong>incluida la respuesta «ninguno»</strong>.
        GCM apunta cuándo se analizó, porque «revisada y sin restricciones»
        y «nadie la ha mirado» se parecen en pantalla y son lo contrario en
        obra.
      </p>
    </S>

    <S titulo="Restricciones con dueño y con fecha">
      <p>
        Una restricción sin responsable es un deseo. Cada una lleva{" "}
        <strong>quién</strong> la libera —alguien de la empresa o un
        contacto externo— y <strong>para cuándo</strong> se comprometió. De
        ahí salen tres cosas: la carga de cada responsable (a quién se le
        está acumulando todo), los recordatorios del reloj cuando algo lleva
        días abierto o su fecha ya pasó, y la{" "}
        <strong>tasa de liberación</strong> — cuánto de lo que se promete
        liberar se libera de verdad, que es la confiabilidad del equipo
        medida y no opinada.
      </p>
    </S>

    <S titulo="El recorrido de cada semana">
      <Recorrido
        pasos={[
          <>
            <strong>Recorrer la ventana</strong>: las tareas de las próximas
            semanas, cada una con su fase y su estado.
          </>,
          <>
            <strong>Analizar las nuevas</strong>: marcar qué flujos les
            aplican, o «ninguno» — que también es una respuesta y queda
            registrada.
          </>,
          <>
            <strong>Asignar y fechar</strong> cada restricción: dueño y
            fecha comprometida.
          </>,
          <>
            <strong>Liberar</strong> durante la semana, y dejar que el reloj
            recuerde lo que se atasca (si la obra tiene los avisos
            encendidos).
          </>,
          <>
            Al armar el plan de la semana,{" "}
            <strong>comprometer solo lo liberado</strong>. El compromiso se
            hace contra una semana ABIERTA del plan semanal; si la semana ya
            se cerró, primero se reabre.
          </>,
        ]}
      />
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Comprometer al plan semanal una tarea con restricciones abiertas",
            pasa: (
              <p>
                La semana nace perdida: el viernes la causa de no
                cumplimiento será «faltó el material» — algo que el martes ya
                se sabía. El PPC baja y no por mala ejecución, sino por mala
                preparación, que es justo lo que el Lookahead existe para
                evitar.
              </p>
            ),
          },
          {
            hace: "Dejar tareas sin analizar y leerlas como «sin restricciones»",
            pasa: (
              <p>
                Son dos estados distintos y GCM los distingue: una tarea sin
                analizar no está limpia, está pendiente. El tablero cuenta
                las no analizadas aparte, porque diez tareas «limpias» que
                nadie miró son diez sorpresas en cola.
              </p>
            ),
          },
          {
            hace: "Apuntar la restricción sin responsable o sin fecha",
            pasa: (
              <p>
                Nadie recibe el recordatorio y la fecha no puede vencerse:
                la restricción envejece en silencio. El panel de «qué falta»
                las cuenta como sin responsable, y esa columna debería
                tender a cero.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: el plan semanal
// ---------------------------------------------------------------------------

const PLAN_SEMANAL = (
  <>
    <Clave>
      El plan semanal es la <strong>promesa</strong>: lo que el equipo se
      compromete a terminar esta semana, elegido entre lo que ya está
      liberado. Al cerrarla se cuenta qué se cumplió —el{" "}
      <strong>PPC</strong>— y, sobre todo, <strong>por qué no</strong> se
      cumplió el resto. Esa segunda pregunta es la que hace mejorar; la
      primera sola solo puntúa.
    </Clave>

    <S titulo="El PPC cuenta promesas, no porcentajes">
      <p>
        El PPC es <strong>compromisos cumplidos entre compromisos
        totales</strong>, sin medias tintas: una tarea al 90% no es media
        promesa cumplida, es una promesa incumplida. Es duro a propósito —
        así se aprende a prometer lo que se puede sostener.
      </p>
      <p>
        El denominador es <strong>todo lo comprometido</strong>, no solo lo
        que alguien se acordó de evaluar: un compromiso sin marcar cuenta
        como no cumplido. Dicho de otra forma,{" "}
        <strong>no cerrar la semana no sube el PPC</strong> — si pudiera
        subirlo, el indicador premiaría el descuido.
      </p>
      <p>
        Cuando el compromiso lleva <strong>cantidad</strong> (metrado
        planificado y ejecutado), la cantidad manda sobre la casilla: si se
        ejecutó lo previsto o más, cuenta cumplido aunque nadie tilde; si se
        quedó corto, no lo salva un tilde. Las dos cosas juntas no pueden
        contradecirse.
      </p>
    </S>

    <S titulo="Las causas: el catálogo es fijo y por eso sirve">
      <p>
        Cada incumplimiento pide su <strong>causa</strong> de una lista
        cerrada. Podría ser texto libre y sería peor: con texto libre,
        «faltó material», «no llegó el fierro» y «proveedor» son tres cosas
        distintas para el sistema y la misma en la obra, y no se puede
        contar nada. Con catálogo fijo sale el <strong>Pareto</strong>: qué
        causa frena más, semana tras semana. Eso es lo que se ataca.
      </p>
      <p>
        Lo que no se cumplió no desaparece: GCM lo{" "}
        <strong>arrastra</strong> y lo enseña al armar la semana siguiente,
        porque un compromiso incumplido que nadie vuelve a mirar es trabajo
        que se pierde entre semanas.
      </p>
    </S>

    <S titulo="El recorrido de cada semana">
      <Recorrido
        pasos={[
          <>
            <strong>Crear la semana</strong> con su fecha de corte. GCM
            numera correlativo por obra y avisa si el número choca con una
            semana que ya existe.
          </>,
          <>
            <strong>Comprometer</strong> desde el Lookahead: solo lo
            liberado. Cada compromiso puede llevar su cantidad y su meta de
            avance.
          </>,
          <>
            Durante la semana, el avance real entra por el{" "}
            <strong>parte del día</strong> — no hace falta esperar al
            viernes.
          </>,
          <>
            <strong>Cerrar la semana</strong>: marcar qué se cumplió, poner
            la causa a lo que no, y con eso quedan el PPC y el Pareto. Al
            cerrar también se registra el avance físico de cada compromiso.
          </>,
        ]}
      />
      <p>
        Una semana cerrada se puede <strong>reabrir</strong> si hay que
        corregirla — y hace falta hacerlo si se quiere comprometer algo más
        en ella, porque desde el Lookahead solo se ofrecen semanas abiertas.
      </p>
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Marcar «cumplido» y dejar vacío el avance de la tarea",
            pasa: (
              <p>
                Este fue un fallo real que <strong>falsificaba la curva
                S</strong>: se daba por hecho que cumplido significaba
                100%, cuando el caso normal del Last Planner es comprometer{" "}
                <em>el tramo de esta semana</em> de una tarea que dura tres.
                El residente marcaba cumplido —que era verdad— y la tarea
                entera saltaba al 100%. Hoy el campo vacío no inventa nada;
                si el tramo terminó la tarea, se escribe el 100 a mano.
              </p>
            ),
          },
          {
            hace: "No cerrar la semana para que el PPC no baje",
            pasa: (
              <p>
                No funciona: lo no evaluado cuenta como incumplido. Y aunque
                funcionara, el PPC no es una nota — un PPC bajo con causas
                bien puestas vale más que un 100% sin información, porque
                dice dónde está el problema.
              </p>
            ),
          },
          {
            hace: "Comprometer la tarea entera en vez del tramo de la semana",
            pasa: (
              <p>
                Casi nunca se cumple, y el PPC castiga algo que en realidad
                fue avance normal. El compromiso semanal es lo que se puede
                terminar <em>esta</em> semana; lo demás es plan, no promesa.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: el parte del dia
// ---------------------------------------------------------------------------

const PARTE = (
  <>
    <Clave>
      El parte del día es la pantalla donde se reporta el avance de{" "}
      <strong>todas las tareas activas de una vez</strong>, con sus fotos. Y
      su regla más importante es lo que <em>no</em> hace:{" "}
      <strong>una casilla vacía no escribe nada</strong>. «De esta tarea no
      sé nada hoy» es una respuesta legítima — un cero o un cien inventados
      son una mentira que llega hasta la curva S.
    </Clave>

    <S titulo="Por qué existe: un envío en vez de cien">
      <p>
        GCM ya sabía registrar el avance de una tarea desde la tabla del
        cronograma, de una en una. Reportar la semana entera así son unas
        cien peticiones contra un servidor que aguanta unas pocas a la vez:
        no es que fuera lento — es que no se hacía, y el avance se reportaba
        tarde o no se reportaba. El parte no trae datos nuevos:{" "}
        <strong>trae un solo envío</strong>.
      </p>
      <p>
        De lo que se reporta aquí salen la curva S, el valor ganado, el
        ritmo de avance y el informe semanal. Es la entrada de datos más
        importante del día a día, y por eso está pensada para hacerse rápido
        y sin mentir.
      </p>
    </S>

    <S titulo="Las fotos van pegadas a la tarea">
      <p>
        Cada tarea admite sus fotos del día, ancladas a{" "}
        <strong>la tarea y la fecha</strong>. Aparecen en el informe semanal,
        pero <strong>solo en la pantalla y en su impresión</strong>: el PDF,
        la hoja de cálculo y el correo no las llevan. Si el cliente tiene que
        verlas, va el papel.
      </p>
      <p>
        Y <strong>no pasan a la galería</strong>. La galería es un escaparate
        aparte, con fotos que se suben allí y se eligen una a una. Lo que se
        sube aquí es <strong>evidencia</strong>: registro de lo que pasó, que
        no se cura ni se borra.
      </p>
    </S>

    <S titulo="El recorrido de cada día">
      <Recorrido
        pasos={[
          <>
            Abrir <strong>Parte del día</strong> dentro de la obra: lista
            las tareas vivas a esa fecha, no el cronograma entero.
          </>,
          <>
            <strong>Escribir solo lo que se sabe</strong>: el porcentaje de
            las tareas que se tocaron hoy. Lo demás se deja en blanco, a
            conciencia.
          </>,
          <>
            <strong>Adjuntar fotos</strong> donde aporten, con su tarea.
          </>,
          <>
            <strong>Enviar</strong>. El avance queda con su fecha, su autor
            y su nota; la curva y los indicadores se mueven solos.
          </>,
        ]}
      />
      <p>
        Cada reporte es una fila nueva y nunca un borrado: la serie completa
        es lo que permite ver el ritmo y saber quién reportó qué y cuándo.
        Corregir es reportar de nuevo — la corrección del mismo día manda
        sobre la anterior.
      </p>
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Rellenar todas las casillas «para que no queden vacías»",
            pasa: (
              <p>
                Es exactamente lo que la pantalla evita. Un porcentaje
                inventado entra en la curva S, en el valor ganado y en el
                informe que se manda al cliente, y ya no hay forma de
                distinguirlo del avance real. El vacío es información: dice
                que hoy nadie miró esa tarea.
              </p>
            ),
          },
          {
            hace: "Reportar el avance solo los viernes, al cerrar la semana",
            pasa: (
              <p>
                El cierre semanal registra el avance de los compromisos,
                pero la obra tiene más tareas que compromisos: lo que no se
                reporta a diario aparece de golpe o no aparece. La curva se
                lee a saltos y el ritmo semanal deja de significar nada.
              </p>
            ),
          },
          {
            hace: "Bajar un porcentaje ya reportado sin explicarlo",
            pasa: (
              <p>
                Se puede —a veces hay que corregir un error—, pero el
                retroceso mueve hacia atrás la curva, el valor ganado y el
                índice de plazo. La nota del reporte es el sitio para decir
                por qué, y es lo que evita que alguien lo lea como un fallo
                del sistema.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: valorizaciones y pagos
// ---------------------------------------------------------------------------

const VALORIZACIONES = (
  <>
    <Clave>
      El contratista <strong>valoriza</strong> —dice a qué porcentaje
      acumulado va su encargo— y contra eso se le <strong>paga</strong>, con
      su constancia adjunta. GCM lleva la cuenta de{" "}
      <strong>a quién le toca valorizar</strong> según la cadencia pactada y
      de <strong>a quién se le debe</strong>, y avisa cuando algo se pasa de
      fecha.
    </Clave>

    <S titulo="La cadencia: dos niveles con herencia">
      <p>
        La <strong>obra</strong> tiene su cadencia por defecto: semanal,
        atada a su día de corte. Cada <strong>contratista</strong> puede
        tener la suya —cada N días, o fechas pactadas como hitos de pago— y,
        si no se le configura ninguna, <strong>hereda la de la obra</strong>.
        Esa herencia es deliberada: obligar a configurar contratista por
        contratista convertiría la función en una lista de pendientes que
        nadie llena.
      </p>
      <p>
        Las valorizaciones son <strong>acumuladas</strong>, no
        incrementales: «vamos al 45%». Por eso una valorización tardía cubre
        las fechas anteriores que nadie registró — un corte del 18 ya
        contesta al hito del 10. Sin esa regla, un hito olvidado se
        reclamaría eternamente.
      </p>
    </S>

    <S titulo="El pago y su constancia">
      <p>
        El pago cuelga del <strong>encargo</strong>, y puede ir asociado a
        una valorización o no —hay adelantos que no valorizan nada—. Lleva
        monto, fecha, quién lo registró y su <strong>constancia en imagen o
        PDF</strong>.
      </p>
      <p>
        Esa constancia se guarda <strong>aparte de las fotos de obra</strong>,
        y no por capricho técnico: las fotos de obra salen en la galería, y
        la galería tiene un enlace que puede ver el cliente. Una constancia
        de pago no puede acabar ahí por un descuido. Además, el archivo se
        guarda <strong>dentro de la misma operación</strong> que el pago: si
        falla el disco no queda la fila, para que el historial no diga que
        hay respaldo cuando no lo hay.
      </p>
      <p>
        Los pagos, como las valorizaciones, <strong>no se editan ni se
        borran</strong>: son historia. Un «por pagar» en negativo no es un
        error — significa que se pagó por adelantado, y la pantalla lo dice
        con esas palabras en vez de dejar un número raro.
      </p>
    </S>

    <S titulo="El recorrido de cada corte">
      <Recorrido
        pasos={[
          <>
            Abrir <strong>Valorizaciones</strong> dentro de la obra: enseña
            a quién le toca, quién no tiene cadencia propia y qué pagos
            faltan por reportar.
          </>,
          <>
            <strong>Registrar la valorización</strong> del contratista: su
            porcentaje acumulado a esa fecha.
          </>,
          <>
            <strong>Registrar el pago</strong> con su constancia cuando se
            haga.
          </>,
          <>
            Dejar que el <strong>aviso</strong> recuerde lo que se pasa de
            fecha: llega a la campanita de los residentes asignados a la
            obra, una vez al día mientras la deuda siga.
          </>,
        ]}
      />
      <p>
        Los contadores del panel se calculan sobre{" "}
        <strong>todos los encargos vigentes</strong>, no sobre la página que
        se está mirando: «3 pendientes» tiene que significar lo mismo en la
        página 1 que en la 2. Los encargos cerrados o anulados no entran —
        uno cerrado ya no valoriza, y llenar el panel de rojo que nadie
        puede cerrar es la forma de que se deje de mirar.
      </p>
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Esperar los avisos con los avisos de la obra apagados",
            pasa: (
              <p>
                <strong>Si la obra no tiene los avisos activados, no suena
                nada</strong>: ni el de valorización, ni los hitos, ni los
                recordatorios de restricciones. Es un solo interruptor por
                obra, y está apagado hasta que alguien lo enciende — GCM no
                empieza a insistir a quien no lo pidió. Se enciende en la
                configuración de avisos de la obra.
              </p>
            ),
          },
          {
            hace: "Registrar la valorización como si fuera el avance del período",
            pasa: (
              <p>
                Es acumulada: si el contratista iba al 30% y esta quincena
                hizo un 15% más, se registra <strong>45</strong>, no 15.
                Poner el incremento hunde la cifra y hace parecer que el
                frente retrocedió.
              </p>
            ),
          },
          {
            hace: "Pagar sin adjuntar la constancia «para subirla luego»",
            pasa: (
              <p>
                El pago sin respaldo es el que aparece en la discusión de
                seis meses después. GCM la pide en el momento porque es
                cuando existe: después hay que buscarla en un chat.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: leer la obra (tablero e indicadores)
// ---------------------------------------------------------------------------

const INDICADORES = (
  <>
    <Clave>
      Aquí no hay cifras nuevas: hay las mismas de siempre puestas juntas
      para poder decidir. Y una regla que gobierna la pantalla entera —{" "}
      <strong>cuando un número no se puede sostener, GCM no lo enseña</strong>
      : dice por qué falta. Un indicador inventado es peor que un hueco,
      porque el hueco se pregunta y el número se cree.
    </Clave>

    <S titulo="El tablero de la obra">
      <p>
        El tablero reúne lo que hay que mirar sin abrir nada: plazo,
        avance contra plan, qué está frenando la obra, la ruta crítica, el
        plan semanal y las órdenes. Se arma <strong>por módulos</strong> —se
        encienden y apagan— porque cada obra y cada persona miran cosas
        distintas.
      </p>
      <p>
        Todas sus cifras salen de <strong>las mismas funciones que las
        pantallas de detalle</strong> a las que enlaza. No es un detalle de
        implementación: un tablero que calcula por su cuenta acaba diciendo
        un número distinto del que dice la pantalla de al lado, y entonces
        no se cree ninguno de los dos.
      </p>
    </S>

    <S titulo="El valor ganado: SPI y CPI">
      <p>
        Tres cifras sostienen todo. El <strong>PV</strong> es cuánto del
        presupuesto <em>deberías</em> haber ganado a la fecha según el plan;
        el <strong>EV</strong>, cuánto has ganado de verdad (presupuesto ×
        avance); el <strong>AC</strong>, cuánto te ha costado — en GCM, lo
        comprometido en órdenes aprobadas.
      </p>
      <p>
        De ahí salen los dos índices: <strong>SPI = EV/PV</strong> (plazo) y{" "}
        <strong>CPI = EV/AC</strong> (costo). Por encima de 1 vas mejor que
        el plan; por debajo, peor. El semáforo los lee igual en toda la
        aplicación: <strong>verde</strong> por encima de 1,{" "}
        <strong>ámbar</strong> entre 0,90 y 1 —ir justo al plan no es ir
        sobrado— y <strong>rojo</strong> por debajo de 0,90.
      </p>
      <p>
        La mitad de <strong>plazo</strong> (PV, EV, SPI) sale siempre. La de{" "}
        <strong>costo</strong> exige ver órdenes: sin ese permiso, el panel
        se queda en el plazo y lo dice, en vez de enseñar un cero que se
        leería como «no hemos gastado nada».
      </p>
    </S>

    <S titulo="Por qué a veces el CPI no aparece">
      <p>
        Al principio de una obra el costo registrado no representa todavía
        el trabajo hecho, y proyectar el final desde ahí da disparates. Pasó
        de verdad en una obra real: con una sola orden aprobada de 11 mil
        frente a 62 mil ya ganados, el CPI salía <strong>5,6</strong> y la
        pantalla anunciaba, en verde, un <strong>ahorro de 634 mil
        soles</strong> — el 82% del presupuesto. No era un error de fórmula:
        era proyectar desde un costo que aún no significaba nada.
      </p>
      <p>
        Por eso hay una <strong>compuerta</strong>: mientras el costo
        registrado no respalde lo ganado, el CPI y la proyección del
        resultado no se enseñan, y en su lugar aparece el motivo. Las cifras
        de plazo siguen siendo válidas y sí se ven.
      </p>
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Celebrar un CPI alto al principio de la obra",
            pasa: (
              <p>
                Es el disparate de arriba, y por eso GCM ya no lo enseña. Si
                alguna cifra de ahorro parece demasiado buena al principio,
                casi siempre es que el costo va por detrás de lo ejecutado:
                se trabaja y la orden se aprueba después.
              </p>
            ),
          },
          {
            hace: "Leer un SPI de 1,00 sin mirar contra qué se mide",
            pasa: (
              <p>
                Sin línea base, el plan es el último corte que subiste:
                estás midiendo contra ti mismo y siempre irás al día. La
                pantalla dice contra qué versión mide — conviene leerlo
                antes de dar el plazo por sano.
              </p>
            ),
          },
          {
            hace: "Comparar el «Comprometido» con el AC del valor ganado",
            pasa: (
              <p>
                No son la misma cifra y no tienen por qué coincidir: el
                Comprometido cuenta encargos vigentes más órdenes sueltas; el
                AC cuenta órdenes aprobadas. Responden preguntas distintas
                —cuánto he pactado y cuánto he formalizado— y el capítulo
                del dinero explica por qué.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: gerencia
// ---------------------------------------------------------------------------

const GERENCIA = (
  <>
    <Clave>
      Gerencia contesta lo que <strong>no se ve mirando las obras de una
      en una</strong>: qué espera tu firma, qué obras se están quedando sin
      bolsa, cuánto hay pedido en adicionales que todavía no cuenta en ningún
      presupuesto, y qué partidas críticas van tarde en toda la cartera. Es de
      empresa, no de obra — por eso no se llama «tablero».
    </Clave>

    <S titulo="Quién entra: es el alcance, no un permiso">
      <p>
        La pantalla es para quien ve <strong>todas</strong> las obras. No
        hace falta un permiso nuevo: quien tiene la cartera entera asignada
        es, por definición, quien responde de ella. A quien lleva una obra,
        un resumen de las demás no le dice nada que pueda usar — y ni
        siquiera le aparece la entrada en el menú.
      </p>
      <p>
        La entrada está <strong>arriba, junto a Obras</strong>, y no dentro de
        «Mi constructora». Estuvo ahí hasta el 24 de agosto de 2026 y era un
        error de sitio: ese grupo nace plegado porque son consultas
        ocasionales, y esta no lo es. Escondida detrás de un plegable, la
        pregunta que se acaba haciendo no es qué le falta a la pantalla sino
        si la pantalla existe.
      </p>
    </S>

    <S titulo="Esperando tu firma">
      <p>
        Lo único de esta pantalla donde <strong>quien mira es el cuello de
        botella</strong>: los demás bloques informan, este pide una decisión
        que solo puede tomar gerencia. Por eso va el primero, y por eso el
        menú lleva una <strong>insignia</strong> con cuántas cosas esperan —
        contando solo las que esa persona puede firmar.
      </p>
      <p>
        Hay dos clases y van en la misma caja, porque para quien firma son la
        misma tarea: los <strong>adicionales</strong> del contratista y las{" "}
        <strong>deducciones de costos propios</strong> que pide la obra. Se
        listan por separado porque tiran del dinero al revés — uno se lo lleva
        y la otra lo devuelve —, así que sumarlas en un solo importe daría una
        cifra que no significa nada.
      </p>
      <p>
        Se ordenan por <strong>antigüedad</strong>, no por importe. Al revés
        que los adicionales en borrador de más abajo: allí se mira exposición,
        aquí es una cola de trabajo, y lo que primero se pudre es lo que lleva
        más tiempo esperando.
      </p>
    </S>

    <S titulo="Obras que se están quedando sin bolsa">
      <p>
        La <strong>bolsa comprometida</strong>: lo que se planificó de margen
        menos las desviaciones de los contratos ya firmados. Es la que baja con
        cada adenda que se aprueba, y hasta el 24 de agosto de 2026 solo se
        podía ver entrando obra por obra a la pantalla de la meta.
      </p>
      <p>
        <strong>No se calcula aquí.</strong> Se lee de lo que el reloj de
        avisos ya midió: esa cuenta cruza el presupuesto vigente entero con la
        meta entera, y hacerla para diez obras al pintar una pantalla es lo que
        en este servidor ya tumbó producción dos veces. Por eso cada fila dice{" "}
        <strong>cuándo se revisó</strong>: la cifra puede tener unas horas, y
        un número de dinero que puede estar viejo y no lo dice es exactamente
        la clase de cifra que no se debe enseñar.
      </p>
      <p>
        Solo salen las que van mal. Y si <strong>ninguna se ha medido</strong>{" "}
        todavía, la pantalla lo dice con esas palabras en vez de quedarse en
        blanco: «ninguna va mal» y «no lo sé» no son lo mismo.
      </p>
    </S>

    <S titulo="Adicionales pedidos y sin aprobar">
      <p>
        Un adicional en <strong>borrador</strong> es dinero que ya se pidió
        y que todavía no cuenta en ningún sitio: el presupuesto solo suma
        los aprobados. Obra por obra no se percibe; en la cartera junta
        puede ser la diferencia entre el margen del año y su ausencia.
      </p>
      <p>
        La cifra se calcula sumando <strong>las líneas</strong> de cada
        movimiento, no su total guardado: mientras el adicional sigue en
        borrador se le añaden y quitan líneas, así que el total guardado va
        por detrás. Cada obra enlaza a sus Movimientos, que es donde el
        adicional se revisa y se aprueba — aprobarlo es lo que lo mete en el
        presupuesto.
      </p>
    </S>

    <S titulo="El semáforo de partidas críticas y el SPI por duración">
      <p>
        Aquí solo salen las partidas que están <strong>en la ruta crítica y
        atrasadas</strong>: su retraso corre la fecha de fin de toda la
        obra. El resto de alertas ya se ven dentro de cada obra y aquí
        serían ruido.
      </p>
      <p>
        Junto a cada obra va su <strong>SPI por duración</strong>, con ese
        nombre completo siempre. No es el SPI del valor ganado: este compara
        avance real contra planeado ponderando por la duración de las
        partidas, sin mirar dinero ni línea base. Llamar «SPI» a secas a dos
        cuentas distintas según la pantalla es como se pierde la confianza
        en las cifras.
      </p>
      <p>
        Por cuidar el servidor, se examina un <strong>número limitado de
        obras por carga</strong>. Si la cartera lo supera, la pantalla lo
        dice con todas las letras: las demás <em>no están evaluadas</em>,
        que no es lo mismo que estar bien.
      </p>
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Leer una lista de bolsas vacía como que todo va bien",
            pasa: (
              <p>
                Si el reloj de avisos no ha pasado todavía por ninguna obra —o
                si ninguna tiene meta y contractual con los que comparar—, no
                hay nada que listar. La pantalla lo dice, y dice de cuántas
                obras vivas hay dato. Una lista vacía sin esa frase se leería
                como una buena noticia que nadie ha comprobado.
              </p>
            ),
          },
          {
            hace: "Leer el semáforo como si cubriera toda la cartera",
            pasa: (
              <p>
                Si hay más obras vivas que el tope por carga, arriba aparece
                el aviso. Un panel que recorta en silencio se lee como «no
                hay nada», que es justo lo contrario de la verdad.
              </p>
            ),
          },
          {
            hace: "Comparar el SPI por duración con el SPI del valor ganado",
            pasa: (
              <p>
                Miden cosas parecidas de forma distinta —uno pondera
                duración contra el corte vigente, el otro dinero contra la
                línea base— y pueden no coincidir. Por eso el rótulo lleva
                siempre el apellido.
              </p>
            ),
          },
          {
            hace: "Dar por bueno un total de adicionales sin abrir las obras",
            pasa: (
              <p>
                Es una <em>intención</em>, no un compromiso: son borradores
                que alguien está redactando y que pueden crecer, encogerse o
                no aprobarse nunca. Sirve para anticiparse, no para
                presupuestar.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: los avisos y el reloj
// ---------------------------------------------------------------------------

const AVISOS = (
  <>
    <Clave>
      Casi todo en GCM lo provoca alguien pulsando algo. Los avisos son la
      excepción: los provoca <strong>que pase el tiempo</strong>, y el
      tiempo no pulsa botones. Por eso hay un <strong>reloj</strong> que
      pasa cada pocos minutos y mira qué lleva días sin resolverse, qué
      fecha se acerca y qué valorización no llegó.
    </Clave>

    <S titulo="El interruptor está apagado hasta que alguien lo enciende">
      <p>
        Los avisos automáticos se activan <strong>por obra</strong>, en su
        configuración, y una obra recién creada los tiene apagados. Es
        deliberado: los que insisten —el recordatorio y el resumen del día—
        empezarían a escribirle a gente que no los pidió, y la forma más
        rápida de que alguien apague los avisos <em>enteros</em> es
        insistirle sin permiso.
      </p>
      <p>
        Consecuencia que hay que saber:{" "}
        <strong>con el interruptor apagado no suena nada en esa obra</strong>{" "}
        — ni los recordatorios de restricciones, ni los hitos, ni el aviso
        de valorización pendiente. Si alguien dice «no me llega nada», es lo
        primero que hay que mirar.
      </p>
      <p>
        Y al encenderlos, la primera pasada <strong>calla a
        propósito</strong>: una obra con cuarenta restricciones viejas
        mandaría cuarenta recordatorios de golpe, y quien acabara de
        configurarlos concluiría —con razón— que esto es spam.
      </p>
    </S>

    <S titulo="Qué avisa, y por dónde">
      <p>
        Hay tres canales. La <strong>campanita</strong> dentro de GCM, que
        solo tienen los usuarios de la empresa; el <strong>correo</strong>,
        que llega también a contactos de fuera; y el <strong>SMS</strong>,
        que <strong>nace apagado siempre</strong> — detrás hay una SIM que
        se paga, y nadie pidió gastarla en su nombre. Quien quiera SMS lo
        enciende en su suscripción.
      </p>
      <p>
        El reloj avisa de cinco cosas: las <strong>restricciones</strong> que
        llevan días abiertas o cuya fecha comprometida ya pasó (un
        recordatorio, y un resumen del día a partir de la hora que diga la
        obra); los <strong>hitos</strong> que se acercan o se pasan, con la
        fecha del cronograma vigente; las{" "}
        <strong>valorizaciones</strong> que tocaban y no constan; las{" "}
        <strong>notas</strong> con recordatorio vencido; y la{" "}
        <strong>bolsa</strong> de la obra cuando queda poca o se acaba. Las
        tres últimas van solo a la campanita.
      </p>
      <p>
        Cuando una restricción tiene <strong>responsable</strong>, esa
        persona recibe el aviso aunque no se haya suscrito a nada: una
        suscripción es una regla general que alguien tuvo que configurar
        bien; una restricción con su nombre encima es un hecho.
      </p>
    </S>

    <S titulo="El anclaje de la obra NO es un aviso">
      <p>
        Es fácil confundirlos y conviene no hacerlo. Lo que sale arriba de
        cada pantalla de la obra diciendo qué toca ahora{" "}
        <strong>no lo manda el reloj</strong>: se calcula al pintar la
        pantalla, no se configura, no se enciende ni se apaga, no escribe a
        nadie y no gasta un SMS. Está siempre, y solo mientras estés mirando
        esa obra.
      </p>
      <p>
        Los avisos de este capítulo son lo contrario: <strong>te
        buscan</strong> —a la campanita, al correo, al móvil—, están apagados
        hasta que alguien los enciende por obra, y siguen sonando aunque no
        hayas abierto GCM en toda la semana. Uno te orienta cuando entras; el
        otro te avisa cuando no estás.
      </p>
    </S>

    <S titulo="La bolsa es la única excepción: avisa sin que la enciendas">
      <p>
        Todo lo demás de este capítulo está apagado hasta que alguien lo
        configura. El aviso de la <strong>bolsa</strong> no: viene encendido
        de fábrica en todas las obras. La razón es lo que dice — que a la
        obra se le está acabando el dinero — y callarlo hasta que alguien
        entre a una pantalla que no sabe que existe sería justo{" "}
        <strong>asumirlo a sabiendas</strong>.
      </p>
      <p>
        <strong>Suena dos veces como mucho</strong>, no todos los días:
        una al bajar del porcentaje que hayas puesto (por defecto, cuando
        queda menos de una cuarta parte de la bolsa prevista) y otra al
        llegar a cero o pasarte. Si la bolsa se recupera —un deductivo, un
        frente que se cierra por debajo— <strong>se rearma</strong> y puede
        volver a sonar si se estropea otra vez. Un aviso que se repitiera
        cada día porque la obra lleva un mes justa se ignoraría a la semana,
        y entonces tampoco se leería el día que pasa algo nuevo.
      </p>
      <p>
        Mira la <strong>bolsa comprometida</strong>, no la prevista: la
        prevista es el margen que planificaste y no se mueve nunca; la
        comprometida le resta las desviaciones de los contratos ya firmados,
        y es la que baja con cada adenda que gerencia aprueba. Llega a los
        residentes y administradores de la obra <strong>y también</strong> a
        la gerencia, porque las dos salidas —renegociar con el contratista o
        deducir de los costos propios— necesitan a los dos enterados.
      </p>
      <p>
        Se configura en <strong>Personal</strong>, junto al resto de los
        avisos: se puede apagar solo él, y se elige a partir de qué
        porcentaje avisa. Con <strong>0</strong> deja de avisar de «queda
        poca» pero sigue avisando cuando la bolsa llega a cero. Y el
        interruptor general de la obra lo apaga como a todo lo demás.
      </p>
    </S>

    <S titulo="Los topes existen para que los avisos se sigan leyendo">
      <p>
        Hay un máximo de SMS por persona y día, y un presupuesto de correos
        por pasada. Lo que no cabe en SMS <strong>degrada a correo</strong>{" "}
        en vez de perderse, y los hitos van por delante en el reparto: son
        pocos y hablan de una fecha que no vuelve, mientras que un
        recordatorio vuelve mañana.
      </p>
      <p>
        El mismo aviso <strong>no se repite</strong>: cada uno lleva su
        marca. El de valorización es la excepción y suena una vez al día
        mientras la deuda siga — si sonara una sola vez, una deuda que nadie
        atendió desaparecería de la vista.
      </p>
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Dar por hecho que los avisos funcionan sin haberlos encendido",
            pasa: (
              <p>
                Es el malentendido más común de todos. Sin el interruptor de
                la obra no sale ni un aviso, y nada falla ni se queja: el
                silencio se parece mucho a «no hay nada pendiente».
              </p>
            ),
          },
          {
            hace: "Esperar el recordatorio de una restricción sin responsable",
            pasa: (
              <p>
                No hay a quién escribirle. Lo recoge la suscripción general
                de la obra si alguien la configuró, y el panel lo cuenta
                como «sin responsable» — esa cifra debería tender a cero.
              </p>
            ),
          },
          {
            hace: "Contar con que el SMS llegue porque es urgente",
            pasa: (
              <p>
                El SMS está apagado salvo que alguien lo encienda en su
                suscripción, y además tiene tope diario. Para algo que no
                puede esperar, el aviso no sustituye a una llamada.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: cerrar, respaldar y restaurar
// ---------------------------------------------------------------------------

const CIERRE = (
  <>
    <Clave>
      Cerrar una obra es declarar que su resultado ya es{" "}
      <strong>historia</strong>: desde ese momento no admite cambios, porque
      modificarla falsearía lo que de verdad pasó. Si además hay que
      borrarla, el camino pasa siempre por{" "}
      <strong>descargar antes su respaldo</strong> — y ese respaldo se puede
      volver a cargar.
    </Clave>

    <S titulo="Cerrar: un cartel que sí se cumple">
      <p>
        Una obra cerrada no acepta escrituras en ninguna pantalla: ni
        importar presupuesto, ni editar partidas, ni registrar avance, ni
        emitir órdenes. Hubo un tiempo en que el cartel decía «no admite más
        cambios» y era mentira —solo impedía cambiar de estado—, y un cartel
        que no se cumple es peor que no ponerlo: enseña a no creerse los
        carteles.
      </p>
      <p>
        Lo que sí se puede siempre es <strong>leer</strong>: la obra cerrada
        se consulta entera, con sus cifras y sus documentos.
      </p>
    </S>

    <S titulo="El respaldo, el borrado y la vuelta">
      <p>
        El <strong>respaldo</strong> es un archivo comprimido con los datos
        de la obra, sus fotos y un informe legible. Va{" "}
        <strong>firmado</strong>: si alguien cambia un céntimo dentro, la
        firma deja de validar, y un respaldo de otra empresa tampoco valida.
      </p>
      <p>
        El <strong>borrado</strong> definitivo es solo del ADMIN y pide dos
        cosas a la vez: escribir el <strong>nombre exacto</strong> de la
        obra y su contraseña. No hay flujo de solicitud ni aprobación de
        terceros — pero tampoco se borra de un clic.
      </p>
      <p>
        La <strong>restauración</strong> devuelve la obra a la aplicación
        como <strong>copia de auditoría</strong>: se ve entera, con todas
        sus pantallas, y no admite ni un cambio. Solo se puede restaurar{" "}
        <strong>en la misma empresa</strong> que generó el respaldo.
      </p>
      <p>
        Dos detalles que conviene saber antes de necesitarlos: al restaurar,
        los avisos de esa obra se fuerzan a <strong>apagados</strong> —si no,
        el reloj empezaría a mandar recordatorios de una obra terminada hace
        años—, y <strong>las fotos no vuelven al disco</strong>: se
        restauran sus fichas, no los archivos. Si las imágenes importan, hay
        que conservar el respaldo.
      </p>
    </S>

    <S titulo="El recorrido, en orden">
      <Recorrido
        pasos={[
          <>
            <strong>Cerrar la obra</strong> cuando de verdad terminó. Desde
            ahí es historia y deja de admitir cambios.
          </>,
          <>
            <strong>Descargar el respaldo</strong> y guardarlo donde la
            empresa guarde lo que no se puede perder. Este paso es el que
            hace reversible el siguiente.
          </>,
          <>
            <strong>Borrar</strong>, si hace falta: ADMIN, nombre exacto y
            contraseña.
          </>,
          <>
            Si algún día hay que revisarla,{" "}
            <strong>cargar el respaldo</strong> desde el Archivo de la
            empresa: vuelve como copia de auditoría, de solo lectura.
          </>,
        ]}
      />
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Borrar una obra sin haber guardado el respaldo",
            pasa: (
              <p>
                No hay vuelta atrás: el borrado es definitivo y se lleva
                partidas, cronograma, avances, órdenes y encargos. El
                respaldo es la única copia — por eso la pantalla lo pide
                antes.
              </p>
            ),
          },
          {
            hace: "Cerrar la obra con trabajo aún por registrar",
            pasa: (
              <p>
                Todo lo que falte por reportar se queda fuera para siempre:
                la obra deja de admitir escrituras. Conviene cerrar el
                último parte, la última valorización y el último pago{" "}
                <em>antes</em> de cerrar.
              </p>
            ),
          },
          {
            hace: "Confiar en un respaldo que nadie ha probado a cargar",
            pasa: (
              <p>
                La restauración está probada de ida y vuelta, pero el
                archivo lo custodias tú: si se corrompe o se pierde en el
                camino, la firma lo detectará y ya no habrá obra a la que
                volver. Un respaldo sin guardar bien es un respaldo que no
                existe.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: en obra, tu dia en tres pasos (la guia de campo)
//
// UNICO capitulo que se aparta de la plantilla, y a proposito: lo lee quien
// esta en la obra, en el movil, y no necesita «para quien es» ni un apartado
// de modos de fallo. Frases cortas y dos recorridos, uno por cada forma de
// entrar. Va el segundo, detras de «empezar», porque es el primero que hace
// falta cuando la obra ya arranco.
// ---------------------------------------------------------------------------

const EN_OBRA = (
  <>
    <Clave>
      Se apunta <strong>lo que pasó</strong>, no lo que debería haber pasado.
      Si de una tarea no sabes nada hoy, se deja en blanco. En blanco es una
      respuesta.
    </Clave>

    <S titulo="Si entras con el código del QR (no tienes usuario ni contraseña)">
      <Recorrido
        pasos={[
          <>
            <strong>Escanea el cartel</strong> de la caseta y pon tu celular o
            tu correo. Te llega un código.
          </>,
          <>
            <strong>Elige la tarea</strong> y sube las fotos de lo que falta o
            de lo que se resolvió.
          </>,
          <>
            Ya está. Tu teléfono <strong>queda reconocido</strong> y mañana
            entras directo.
          </>,
        ]}
      />
      <p>
        Si no te llega el código, no lo intentes más veces: avisa al
        residente. Casi siempre es un dígito mal apuntado en tu número, y
        hasta que no lo corrija no te va a llegar nunca.
      </p>
    </S>

    <S titulo="Si entras con tu usuario (residente)">
      <Recorrido
        pasos={[
          <>
            Abre <strong>Parte del día</strong>. Salen las tareas vivas de
            hoy, no el cronograma entero.
          </>,
          <>
            Escribe el porcentaje <strong>solo de las que se tocaron</strong>.
            Las demás, en blanco.
          </>,
          <>
            Añade las fotos donde aporten y envía. Un solo envío para todo el
            día.
          </>,
        ]}
      />
    </S>

    <S titulo="Tres cosas que conviene saber">
      <p>
        <strong>Lo que subes no se borra</strong>: es la prueba de lo que se
        hizo ese día, con tu nombre y la fecha.
      </p>
      <p>
        Las fotos bonitas para el cliente van por otro sitio (la{" "}
        <strong>galería</strong>). Lo que subes aquí es constancia de obra, no
        escaparate.
      </p>
      <p>
        Con el código del QR <strong>no se reporta avance</strong>, solo se
        suben fotos. El porcentaje lo pone el residente.
      </p>
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: los movimientos presupuestales
// ---------------------------------------------------------------------------

const MOVIMIENTOS = (
  <>
    <Clave>
      La línea base es el presupuesto firmado y no se toca nunca más. Todo lo
      que pase después va <strong>encima</strong>, en movimientos que se suman
      aparte. Por eso hay tres cifras y no una: <strong>Base</strong> (lo
      congelado) más <strong>Ajustes</strong> (los movimientos aprobados) da
      el <strong>Vigente</strong>, que es contra lo que se mide todo.
    </Clave>

    <S titulo="Los tres tipos, y no hay más">
      <p>
        El <strong>adicional</strong> aumenta el presupuesto: solo lleva
        entradas, y procede por vicios ocultos o cambios de diseño. El{" "}
        <strong>deductivo</strong> reduce: solo salidas. La{" "}
        <strong>reconversión</strong> no cambia el total —saca de una partida
        y mete en otra—, y por eso sus líneas suman cero.
      </p>
      <p>
        No se pueden mezclar: un adicional con una línea negativa se rechaza,
        diciendo que para reducir se usa un deductivo. Y tampoco se presentan
        compensados: un adicional y un deductivo del mismo importe{" "}
        <strong>no se enseñan como 0,00</strong>, porque son dos hechos
        distintos, cada uno con su documento detrás.
      </p>
    </S>

    <S titulo="El recorrido de la primera vez">
      <Recorrido
        pasos={[
          <>
            Hace falta la <strong>línea base aprobada</strong>. Sin ella no
            existe el «encima de la base», y la pantalla lo dice con esas
            palabras en vez de enseñar una tabla vacía.
          </>,
          <>
            Se redacta en <strong>borrador</strong>, con la fecha del
            documento que lo respalda —no la del día en que se teclea— y su
            correlativo, para poder citarlo en un acta: «Movimiento 003».
          </>,
          <>
            Se <strong>aprueba</strong>, y ahí es cuando entra al presupuesto
            vigente.
          </>,
          <>
            Si el adicional traía partidas nuevas, es el momento de{" "}
            <strong>enlazarlas con sus tareas</strong>: se ofrece ahí mismo.
            Quien acaba de aprobar es quien sabe a cuál va cada una.
          </>,
        ]}
      />
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Querer deshacer un movimiento ya aprobado",
            pasa: (
              <p>
                No se puede, y es a propósito: los indicadores se miden contra
                el vigente, y deshacerlo los recalcularía hacia atrás. Se
                corrige registrando otro de signo contrario, y quedan los dos
                rastros — que es lo que pasó de verdad.
              </p>
            ),
          },
          {
            hace: "Intentar dar de alta partidas nuevas con un deductivo o una reconversión",
            pasa: (
              <p>
                Solo el adicional puede. Y nacen <strong>al aprobar</strong>,
                no al redactar: así un borrador descartado no deja partidas
                fantasma en un árbol que la línea base ya no deja limpiar.
              </p>
            ),
          },
          {
            hace: "Aprobar el adicional y dejar sus partidas sin enlazar",
            pasa: (
              <p>
                Quedan fuera de la medición en dinero, y en un mes ya nadie
                recuerda a qué tarea iban. Por eso el enlace se ofrece justo
                al aprobar, y no en una pantalla a la que hay que volver.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: enlazar tareas con partidas
// ---------------------------------------------------------------------------

const MAPEO = (
  <>
    <Clave>
      El cronograma dice <strong>cuándo</strong> y el presupuesto dice{" "}
      <strong>cuánto</strong>, pero no se conocen entre sí. Enlazarlos es lo
      que permite comparar, partida por partida, cuánto se ha{" "}
      <strong>gastado</strong> contra cuánto se ha <strong>avanzado</strong>{" "}
      —y hace más fiables el índice de costo (CPI) y sus proyecciones (EAC,
      VAC)—. El peso del avance sigue siendo la <strong>duración</strong>,
      con o sin mapeo: eso no cambia aquí.
    </Clave>

    <S titulo="La cobertura es la cifra que manda">
      <p>
        La <strong>cobertura</strong> dice qué parte del presupuesto tiene ya
        tarea enlazada. Por debajo del <strong>60%</strong>, el CPI y sus
        proyecciones describen una fracción pequeña de la obra y conviene no
        fiarse de ellos; al pasar del 60%, empiezan a representar la obra
        real. El peso del avance, mientras tanto, no cambia: GCM pondera
        siempre por duración, nunca por dinero.
      </p>
      <p>
        Ojo con una lectura tentadora: la cobertura no es la compuerta del
        índice de costo. Que el CPI se calle al principio de la obra depende
        de otra cosa —que el costo registrado respalde lo ya ganado—, y eso se
        explica en el capítulo de indicadores. Lo que cambia aquí es{" "}
        <strong>cuánta obra describe esa cifra de costo</strong>, no con qué
        se pesa el avance.
      </p>
    </S>

    <S titulo="Aquí solo se propone; decide una persona">
      <p>
        Y hay un motivo medido en los archivos reales de la empresa: enlazar
        automáticamente por código resultó <strong>peor que no
        enlazar</strong>. De 56 coincidencias de código, 36 apuntaban a otra
        cosa, porque el capítulo 5 del cronograma va desplazado respecto al
        del presupuesto y el «5.5» habría caído sobre un descuento comercial.
      </p>
      <p>
        Por eso la coincidencia de código <strong>se marca pero no
        puntúa</strong>: si puntuara, pondría arriba justo los emparejamientos
        falsos, y quien revisa aceptaría el primero. Lo que ordena la lista es
        el parecido de la descripción.
      </p>
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Aceptar la propuesta porque «el código coincide»",
            pasa: (
              <p>
                Es la trampa medida, y la pantalla la rotula como poco fiable.
                Se acepta leyendo el <strong>nombre</strong>, no el número. Un
                mapeo equivocado no da ningún síntoma: la curva sale bonita y
                miente.
              </p>
            ),
          },
          {
            hace: "Esperar que enlazar cambie el avance",
            pasa: (
              <p>
                No lo cambia: cambia con qué se pesa. La obra no avanza más,
                se mide mejor — y por eso el porcentaje puede moverse al
                cruzar el umbral sin que nadie haya ejecutado nada.
              </p>
            ),
          },
          {
            hace: "Aprobar un adicional y dejar sus partidas nuevas sin enlazar",
            pasa: (
              <p>
                Nacen sueltas, y quien las acaba de aprobar es el único que
                sabe a qué tarea van. Es el mismo caso que cierra el capítulo
                de movimientos, visto desde este lado.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: las notas de la obra
// ---------------------------------------------------------------------------

const NOTAS = (
  <>
    <Clave>
      La bitácora libre de la obra: un pago pendiente, un tema legal, un
      hallazgo suelto que no tienen dónde ir en ningún formulario reglado.
      Cuatro categorías fijas —financiero, logística, operativo, legal— y, si
      hace falta, una fecha en la que alguien quiere que se lo recuerden.
    </Clave>

    <S titulo="No es una Restricción del Lookahead">
      <p>
        Si lo que hay que anotar es <strong>por qué una tarea está
        bloqueada</strong>, no es una nota: es una Restricción, en el
        Lookahead. Una Restricción tiene un tipo cerrado (seguridad,
        información, espacio…), un responsable con nombre y una fecha de{" "}
        <strong>compromiso</strong> — alguien se hace cargo. Una nota no
        compromete a nadie: es texto libre y, como mucho, una fecha de{" "}
        <strong>recordatorio</strong>, que no es lo mismo que un compromiso.
      </p>
      <p>
        La pantalla lo recuerda con un aviso justo debajo del cuerpo de la
        nota, con el enlace al Lookahead a mano. Mezclarlas esconde el
        bloqueo real de la obra en un cajón que nadie revisa con la misma
        disciplina que la matriz de restricciones.
      </p>
    </S>

    <S titulo="Vencida se calcula, no se guarda">
      <p>
        Una nota con recordatorio se marca <strong>vencida</strong> sola
        cuando su fecha ya pasó y sigue sin atender — nadie la marca a mano ni
        hay que acordarse de cambiarla. Atenderla la saca de vencidas al
        instante, sin tocar su fecha, y queda su historial de quién y cuándo.
      </p>
      <p>
        Las vencidas salen también en <strong>«Próximos recordatorios»</strong>{" "}
        del tablero de la obra, y en el aviso rojo de la propia pestaña
        «Notas» en el riel: son dos avisos del mismo hecho, no dos hechos
        distintos.
      </p>
    </S>

    <S titulo="Quién puede qué">
      <p>
        Anotar y marcar atendido o reabrir es trabajo de campo, reversible: lo
        hace quien tiene permiso de <strong>crear</strong>. Corregir el texto
        de otro o borrar una nota es distinto — reescribe o destruye lo que
        alguien ya escribió — y pide el permiso de <strong>gestionar</strong>,
        aparte.
      </p>
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Usar una nota para explicar por qué una tarea no puede empezar",
            pasa: (
              <p>
                Se pierde en la bitácora general en vez de aparecer en la
                matriz de restricciones del Lookahead, que es donde el
                residente mira antes de comprometer la semana. Créala ahí: de
                verdad bloquea algo en pantalla, con responsable y fecha de
                compromiso.
              </p>
            ),
          },
          {
            hace: "Esperar que una nota sin fecha salga en «Próximos recordatorios»",
            pasa: (
              <p>
                No sale, y es a propósito: sin fecha no hay nada que recordar
                en un día concreto. Sigue viva en la bitácora de la obra,
                solo que no en el widget del tablero.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: el Kanban de obra
// ---------------------------------------------------------------------------

const KANBAN = (
  <>
    <Clave>
      Las mismas tareas del Lookahead y del plan semanal, en columnas para
      verlas de un vistazo: <strong>Sin analizar → Con restricciones → Lista →
      Comprometida → En ejecución → Cerrada</strong>. Las tres primeras salen
      del Lookahead; las tres últimas, del plan semanal. Ninguna columna es
      inventada: todas son estados que la obra ya recorre.
    </Clave>

    <S titulo="Una tarea, una sola columna">
      <p>
        Manda la de <strong>más a la derecha</strong>: si ya se evaluó,
        cerrada; si se prometió, comprometida; si no, la que diga su análisis.
        Sin esa regla, una tarea lista <em>y</em> comprometida aparecería dos
        veces y el tablero contaría dos veces el mismo trabajo — que es peor
        que no tenerlo, porque encima se planifica sobre eso.
      </p>
      <p>
        Quien solo tiene permiso sobre el Lookahead ve las{" "}
        <strong>tres primeras</strong> columnas y las tres últimas vacías, en
        vez de un error: el plan semanal tiene su propio permiso.
      </p>
    </S>

    <S titulo="Es de mirar, no de arrastrar">
      <p>
        Cada movimiento real —analizar, levantar una restricción, comprometer,
        cerrar— tiene su pantalla, con su permiso y su registro de quién lo
        hizo, y cada tarjeta <strong>enlaza</strong> a donde se actúa.
        Arrastrar tarjetas duplicaría esas acciones donde no se ven las
        consecuencias. Además, así funciona bien en el móvil.
      </p>
      <p>
        La única excepción es un botón: marcar que un compromiso{" "}
        <strong>empezó en obra</strong>, que es lo que llena la columna «En
        ejecución». Se marca y se desmarca a mano —es reversible, porque no
        mueve dinero— y sella la fecha en vez de un sí/no, para poder medir
        algún día cuánto tarda en arrancar lo que se prometió. No se deduce de
        la cantidad ejecutada a propósito: un cero significa a la vez «empezó
        y no hay avance medible» y «no ha empezado».
      </p>
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Buscar el histórico entero en el tablero",
            pasa: (
              <p>
                Solo trae las semanas <strong>abiertas</strong> y la{" "}
                <strong>última cerrada</strong>. Si creciera sin límite
                dejaría de leerse, que es justo lo que un tablero no puede
                permitirse.
              </p>
            ),
          },
          {
            hace: "Leer «Sin analizar» como «sin restricciones»",
            pasa: (
              <p>
                Son lo contrario. Sin analizar significa que{" "}
                <strong>nadie la ha mirado todavía</strong>; lista significa
                que se miró y no le falta nada. Es la misma distinción que
                cuida el Lookahead.
              </p>
            ),
          },
          {
            hace: "Extrañar una tarea comprometida a mano",
            pasa: (
              <p>
                Si no vino del Lookahead, la tarjeta lo dice con esas palabras
                («No vino del Lookahead»): se prometió sin pasar por el
                análisis de restricciones. No es un error —a veces hay que
                hacerlo— pero conviene verlo.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: el personal que documenta en obra (los pases)
// ---------------------------------------------------------------------------

const PERSONAL = (
  <>
    <Clave>
      El maestro, el capataz o el subcontratista <strong>no tienen cuenta de
      GCM</strong>: no recordarían una contraseña, y darles usuario les
      abriría un sistema que maneja dinero. En su lugar tienen un{" "}
      <strong>pase</strong>: entran con su celular o su correo, reciben un
      código, y lo único que pueden hacer es adjuntar fotos de esa obra.
    </Clave>

    <S titulo="Cómo entra, y por qué no entra cualquiera">
      <p>
        Escanea el QR de la caseta, se identifica, y recibe un código{" "}
        <strong>por SMS y por correo a la vez</strong>: el teléfono de la obra
        puede estar sin saldo y el correo puede tardar, y mandarlo por los dos
        cuesta lo mismo.
      </p>
      <p>
        Solo entra quien el residente <strong>dio de alta antes en esa
        obra</strong>. Si cualquiera pudiera teclear un número y recibir
        código, el pase no valdría nada. Y la pantalla responde igual exista
        el contacto o no, para no convertirse en un detector de quién trabaja
        en la obra. Un pase alcanza <strong>una sola obra</strong>: la obra
        sale de la ficha del pase, nunca de lo que se teclee.
      </p>
    </S>

    <S titulo="Tres cosas parecidas que no son lo mismo">
      <p>
        <strong>Personal</strong> es quien documenta sin cuenta (los pases).{" "}
        <strong>Equipo</strong> son los usuarios de GCM que tienen la obra
        asignada, y eso es lo que decide quién la <em>ve</em>.{" "}
        <strong>Contratistas</strong> son las empresas con las que se firma, y
        no entran a la aplicación.
      </p>
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Esperar que el de campo reporte avance con su pase",
            pasa: (
              <p>
                No puede: el sistema lo rechaza diciendo que un pase no
                reporta avance de tareas. El parte del día lo llena el
                residente, con sesión. El pase solo cuelga fotos de
                restricciones y compromisos.
              </p>
            ),
          },
          {
            hace: "Teclear mal el celular al dar de alta",
            pasa: (
              <p>
                Esa persona <strong>no recibirá ningún código nunca</strong> y
                nada lo avisa —el sistema calla a propósito ante un contacto
                que no existe—. Se corrige editando el contacto, lo que además
                cierra las sesiones abiertas con el número viejo.
              </p>
            ),
          },
          {
            hace: "Borrar un pase en vez de revocarlo",
            pasa: (
              <p>
                Revocar le quita el acceso al instante y conserva su ficha;
                borrar se la lleva, y sus fotos quedan firmadas solo con un
                nombre en texto, sin nadie detrás a quien volver. Sus fotos
                son evidencia y su autoría tiene que poder rastrearse.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: la galeria
// ---------------------------------------------------------------------------

const GALERIA = (
  <>
    <Clave>
      El escaparate de la obra, y un mundo <strong>aparte</strong> de la
      evidencia. La evidencia del parte del día es registro probatorio y no se
      toca; la galería <strong>se cura</strong>: se sube, se describe, se
      publica foto a foto y, si una salió mal, se quita.
    </Clave>

    <S titulo="Aquí se sube; del parte del día no llega nada">
      <p>
        Las fotos de la galería se suben <strong>aquí</strong>. No llegan
        solas desde el parte del día: no hay ningún camino entre las dos, y es
        deliberado, porque curar el escaparate no puede tocar el archivo
        probatorio.
      </p>
    </S>

    <S titulo="Publicar es un permiso aparte de subir">
      <p>
        Subir y describir es trabajo de campo; decidir qué ve el cliente es un
        acto de gerencia. Por eso el enlace nace <strong>apagado</strong> y
        cada foto nace <strong>sin publicar</strong>: retratar personas y
        errores es una decisión, nunca un descuido.
      </p>
      <p>
        Al cliente se le enseñan el nombre de la obra y, de cada foto
        publicada, su título, su descripción y su fecha.{" "}
        <strong>Nunca quién la subió</strong>: los nombres del personal no son
        parte del escaparate.
      </p>
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Activar el enlace sin haber publicado ninguna foto",
            pasa: (
              <p>
                El cliente abre una página vacía con membrete. La pantalla lo
                avisa antes, porque el enlace ya está repartido cuando alguien
                se da cuenta.
              </p>
            ),
          },
          {
            hace: "Rotar el enlace creyendo que se cierra",
            pasa: (
              <p>
                Rotar reparte una llave nueva y deja la puerta{" "}
                <strong>abierta</strong>: es lo que se quiere cuando se
                compartió con quien ya no debe verlo. Para cerrarla está
                «desactivar». El enlace viejo deja de funcionar al instante en
                los dos casos.
              </p>
            ),
          },
          {
            hace: "Suponer que lo del parte del día ya está publicado",
            pasa: (
              <p>
                No lo está: son dos almacenes distintos. Y al revés, quitar
                una foto de la galería no toca la evidencia — que es
                exactamente lo que se busca.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: el informe semanal
// ---------------------------------------------------------------------------

const INFORME = (
  <>
    <Clave>
      Una foto de la obra a una fecha, que sale por cinco puertas —pantalla,
      impresión, PDF, hoja de cálculo y correo— <strong>todas con los mismos
      datos</strong>. Se compone una sola vez para que el papel y el Excel no
      puedan decir cosas distintas.
    </Clave>

    <S titulo="Qué lleva, y qué deja fuera a propósito">
      <p>
        En este orden: portada, resumen, lo que pasó en el período, avance por
        capítulo, partidas activas de la semana, partidas atrasadas, Last
        Planner (PPC y causas) y curva S. La <strong>fecha de corte es
        libre</strong>: cualquier día, no solo los cortes del plan — un
        informe se pide por una visita del cliente o por una valorización, no
        por el calendario del PTS.
      </p>
      <p>
        Quedan fuera los capítulos <strong>sin trabajo medible</strong> (los
        de puros hitos darían un atraso que no existe), los que están{" "}
        <strong>enteros a cero</strong> (son de más adelante y empujan fuera
        de la página a los que están en marcha) y las partidas{" "}
        <strong>ya terminadas</strong> (en un informe semanal interesa lo que
        queda). Un capítulo atrasado tampoco se lista como alerta aparte: lo
        está porque lo están sus partidas, y listarlo duplicaría el aviso.
      </p>
    </S>

    <S titulo="Ojo con las fotos">
      <p>
        Salen <strong>solo en la pantalla y en la impresión</strong>. El PDF,
        el CSV, el correo y el SMS no las llevan. Si el cliente tiene que
        verlas, va el papel impreso o la galería.
      </p>
    </S>

    <S titulo="Los canales, y sus reglas">
      <p>
        El <strong>correo</strong> se manda uno a uno —la lista puede llevar
        al cliente y al contratista, y ninguno tiene por qué ver al otro— y
        adjunta el PDF y el CSV a la vez.
      </p>
      <p>
        El <strong>SMS</strong> va sin tildes y sin enlaces: las operadoras
        marcan como spam los SMS con URL, así que el que lleve enlace es el
        que no llega. Si no cabe, se sacrifican primero las partidas graves,
        luego el PPC, y como último recurso se recorta el nombre de la obra —{" "}
        <strong>nunca una cifra</strong>.
      </p>
      <p>
        El umbral para decir «al día» es <strong>medio punto</strong> de
        desviación, el mismo en el correo y en el SMS: sin él, un +0,02 se
        anunciaría como «por delante del plan» en un correo que a veces va al
        cliente.
      </p>
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Mandar el PDF esperando que lleve las fotos",
            pasa: (
              <p>
                No las lleva, y es el malentendido más caro de esta pantalla
                porque se descubre cuando el cliente ya lo abrió. Si las fotos
                importan, va el papel o el enlace de la galería.
              </p>
            ),
          },
          {
            hace: "Leer una tabla vacía como un fallo",
            pasa: (
              <p>
                Cuando está vacía lo explica, y casi siempre significa «esa
                semana no hubo». Es la misma disciplina del resto de GCM:
                antes que un hueco mudo, el motivo.
              </p>
            ),
          },
          {
            hace: "Esperar el PPC de una semana abierta",
            pasa: (
              <p>
                No se calcula, ni en el cuerpo del correo ni en el SMS: un
                porcentaje a medio evaluar acabaría promediándose con los de
                verdad y ensuciaría la serie.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: la propuesta para el cliente
// ---------------------------------------------------------------------------

const PROPUESTA = (
  <>
    <Clave>
      La propuesta es el mismo presupuesto contractual, vestido para salir: con
      el logo de la empresa y la cascada de precios en el orden que pide SUNAT.
      Lo que se elige antes de emitirla es <strong>cómo se presenta</strong> —
      cómo se factura, en qué moneda, cuánto detalle—, nunca cuánto cuesta: eso
      ya lo fijó la revisión.
    </Clave>

    <S titulo="De costo directo a precio de venta">
      <p>
        La cascada tiene siempre los mismos escalones. Se parte del{" "}
        <strong>costo directo</strong> —la suma de las partidas—; encima van
        los <strong>gastos generales</strong> y la <strong>utilidad</strong>,
        los dos como porcentaje del costo directo. Eso da el{" "}
        <strong>subtotal</strong>.
      </p>
      <p>
        Del subtotal se resta el <strong>descuento comercial</strong>, si lo
        hay, y ahí aparece el <strong>valor de venta</strong>: la cifra que la
        obra controla y la que se guarda en la revisión. Sumándole el IGV sale
        el <strong>precio de venta</strong>, que es lo que el cliente paga.
      </p>
      <p>
        El descuento se calcula sobre el subtotal y no sobre el costo{" "}
        <em>a propósito</em>: es un descuento sobre el PRECIO, no un recorte
        del costo. Rebajarlo antes de los gastos generales y la utilidad haría
        que un descuento comercial se comiera también el margen, sin que nadie
        lo hubiera decidido.
      </p>
    </S>

    <S titulo="Con IGV, con recibo por honorarios, o sin impuesto">
      <p>
        Con <strong>IGV</strong> es lo normal cuando factura una constructora.
        Con <strong>recibo por honorarios</strong> no hay IGV, pero el cliente
        retiene el 8 % de renta de cuarta categoría, y eso se puede presentar
        de dos formas: <strong>descontada</strong> —el precio pactado no cambia
        y abajo se lee cuánto queda limpio, que es lo que ocurre de verdad— o{" "}
        <strong>asumida</strong>, donde el precio sube justo lo necesario para
        que, después de retener, quede limpio lo que se quería cobrar.
      </p>
      <p>
        Cuidado con el nombre: esta retención es la que <strong>te hace el
        cliente a ti</strong>. No es la misma que tú le practicas a un
        contratista al pagarle una orden —esa está en el capítulo del dinero—,
        aunque las dos se llamen igual.
      </p>
    </S>

    <S titulo="Soles o dólares, y cuánto detalle">
      <p>
        En GCM todo el dinero se guarda en <strong>soles</strong>. La propuesta
        se puede emitir en dólares, pero solo si la revisión trae{" "}
        <strong>tipo de cambio</strong>: si no lo trae, la opción sale
        bloqueada. Inventar la cotización del día sería poner un precio que
        nadie pactó. El papel dice a qué cambio se convirtió.
      </p>
      <p>
        El detalle se elige entre todo, hasta partidas, o solo capítulos.
        Cambiarlo <strong>no mueve el total</strong>: cuando las partidas se
        resumen, el capítulo pasa a llevar su subtotal, de modo que la columna
        siempre suma la misma cifra. El Excel sale siempre con todo el detalle,
        porque es el archivo con el que se trabaja.
      </p>
    </S>

    <S titulo="El recorrido de la primera vez">
      <Recorrido
        pasos={[
          <>
            Entrar desde <strong>Revisiones</strong>, en «Ver la propuesta para
            el cliente». No tiene sección propia en el menú de la obra: cuelga
            de la revisión, que es de donde saca sus cifras.
          </>,
          <>
            <strong>Elegir cómo se factura</strong> y, si hace falta, la moneda
            y cuánto detalle. Las cifras se recalculan a la vista.
          </>,
          <>
            Añadir la <strong>presentación</strong> y las{" "}
            <strong>observaciones</strong> si el cliente las necesita. Las
            condiciones de la revisión salen solas.
          </>,
          <>
            <strong>Imprimir o guardar como PDF</strong> —lo hace el
            navegador— o <strong>descargar el Excel</strong>. Los dos dicen lo
            mismo: salen del mismo cálculo.
          </>,
        ]}
      />
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Mandar una propuesta que todavía es borrador",
            pasa: (
              <p>
                Sin revisión aprobada sale la última que haya, y el papel lo
                dice con un sello que <strong>también se imprime</strong>. Está
                puesto para eso, pero el sello avisa: no decide por ti.
              </p>
            ),
          },
          {
            hace: "Buscar los dólares y encontrar la opción bloqueada",
            pasa: (
              <p>
                Esa revisión se creó sin tipo de cambio. Se anota al crear la
                revisión, no aquí: la propuesta no inventa cotizaciones.
              </p>
            ),
          },
          {
            hace: "Querer cambiar la utilidad o el descuento desde la propuesta",
            pasa: (
              <p>
                No se puede, y es deliberado. Esos porcentajes vienen de la
                revisión aprobada, que es la referencia contra la que se mide la
                obra: cambiarlos al emitir daría un papel que contradice a la
                línea base. Para cambiarlos se crea una revisión nueva.
              </p>
            ),
          },
        ]}
      />
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: preguntas frecuentes
// ---------------------------------------------------------------------------

/**
 * Las preguntas que se repiten, con su respuesta.
 *
 * Vinieron de `docs/MANUAL.md`, un manual en Markdown que competia con este y
 * que ningun usuario de obra abre nunca —era un archivo del repositorio—. Al
 * traerlas se comprobo cada una contra el sistema de HOY, y una habia dejado
 * de ser cierta: la de por que el avance no esta en soles, escrita cuando la
 * ponderacion por dinero no existia. Es exactamente lo que pasa con dos
 * manuales: el que nadie mira se queda viejo y sigue afirmando.
 */
const PREGUNTAS = (
  <>
    <Clave>
      Casi todas estas preguntas nacen del mismo sitio: GCM prefiere{" "}
      <strong>callar a inventar</strong>. Cuando una cifra no se puede
      sostener con lo que hay, no sale un numero bonito: sale la razon por la
      que falta. Si algo «no aparece», la respuesta casi siempre es que
      todavia no hay con que responderlo.
    </Clave>

    <S titulo="¿Por qué mi avance físico no está en soles?">
      <p>
        Puede estarlo, y depende de una sola cosa: de que GCM sepa{" "}
        <strong>cuánto vale cada tarea</strong>. Mientras no lo sepa, pesa por
        duración, que es lo único que trae el archivo de MS&nbsp;Project. Con
        números reales:
      </p>
      <Tabla
        cabeceras={["Tarea", "Duración", "Costo", "Avance"]}
        filas={[
          ["Curado de concreto en zapatas", "60 d", "S/ 10.000", "20 %"],
          ["Suministro y montaje de estructura", "5 d", "S/ 200.000", "100 %"],
        ]}
      />
      <p>
        Ponderado por duración da <strong>26 %</strong>. Ponderado por dinero,{" "}
        <strong>96 %</strong>. El curado dura mucho y no cuesta casi nada.
      </p>
      <p>
        <strong>Cómo se pasa a dinero:</strong> enlaza tareas con partidas en{" "}
        <em>Cronograma → Enlazar con el presupuesto</em>. En cuanto el mapeo
        cubre el <strong>60 %</strong> del presupuesto, la obra entera pasa a
        pesarse por dinero. No hace falta mapear todo: empieza por los
        capítulos que concentran el importe.
      </p>
      <p>
        La decisión se toma <strong>una vez por obra</strong> y la comparten la
        curva S, el informe semanal y el ritmo, para que las tres no puedan
        contestar distinto. La tabla de capítulos es la excepción y es
        deliberada: su planeado se lee del propio archivo de Project, que
        consolida por duración, y pesar el real por dinero restaría dos varas
        distintas.
      </p>
    </S>

    <S titulo="¿Qué diferencia hay entre capítulo, partida y tarea?">
      <p>
        <strong>Capítulo</strong>: solo agrupa. No lleva metrado ni costo
        propio. <strong>Partida</strong>: la hoja del presupuesto, con unidad,
        metrado y precio — es la unidad de <strong>dinero</strong>.{" "}
        <strong>Tarea</strong>: viene de Project, con fechas y duración — es la
        unidad de <strong>tiempo</strong>.
      </p>
      <p>
        Son dos árboles distintos, y se cruzan con un mapeo que confirma una
        persona.
      </p>
    </S>

    <S titulo="¿Una tarea puede tener varias partidas?">
      <p>
        Sí, y al revés también. «Instalaciones piso 1» puede tocar tubería,
        cableado y accesorios; «Concreto en zapatas» puede repartirse en tres
        tareas por zonas.
      </p>
      <p>
        Por eso, cuando una tarea toca partidas con unidades distintas (m² y
        kg), el sistema <strong>no inventa</strong> una cantidad: te la pide.
      </p>
    </S>

    <S titulo="¿El sistema no puede mapear solo las partidas?">
      <p>
        Ya lo hace: te propone las que más se parecen. Lo que no hace es{" "}
        <strong>confirmar</strong> solo, y hay una razón medida sobre archivos
        reales: de 56 coincidencias de código, <strong>36 apuntaban a otra
        cosa</strong>. Un mapeo equivocado no da síntoma — la curva sale bonita
        y miente.
      </p>
    </S>

    <S titulo="¿Qué es la ruta crítica?">
      <p>
        La cadena de tareas donde <strong>un día perdido es un día perdido de
        obra entera</strong>. Las demás tienen holgura.
      </p>
      <p>
        Viene marcada por Project; GCM no la deduce. Lo que sí hace es quitar
        los capítulos y los hitos, que Project también marca pero sobre los que
        no se puede actuar: meter cuadrilla en un capítulo no significa nada.
      </p>
    </S>

    <S titulo="La tarea sigue sin pasar a LISTA">
      <p>Dos causas posibles, y la matriz las distingue:</p>
      <SaleMal
        casos={[
          {
            hace: "Dice «Sin analizar»",
            pasa: (
              <>
                Nadie ha dicho todavía qué restricciones le aplican.
                Selecciónala y pulsa <em>Analizar</em>. Si no le aplica
                ninguna, «No les aplica ninguna» la deja lista al momento.
              </>
            ),
          },
          {
            hace: "Le queda alguna casilla sin marcar",
            pasa: (
              <>
                Fíjate en las columnas: un <strong>guion</strong> es un flujo
                que no aplica; una casilla <strong>vacía</strong> es uno
                pendiente. Solo se pone LISTA cuando no queda ninguna vacía.
              </>
            ),
          },
        ]}
      />
    </S>

    <S titulo="Quité un flujo y sigue ahí">
      <p>
        A propósito. Una restricción <strong>ya levantada, con fotos de
        evidencia o con una nota escrita</strong> no se borra: sería tirar
        trabajo hecho, y las fotos quedarían sin sitio donde verse nunca más.
        El panel te dice cuántas se conservaron y por qué. Solo se retiran las
        que están en blanco.
      </p>
    </S>

    <S titulo="¿Por qué me pide confirmar al comprometer?">
      <p>Por una de tres, y el aviso dice cuál:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Nadie la ha analizado</strong>: no se sabe si se puede hacer.
        </li>
        <li>
          <strong>Le quedan restricciones sin liberar</strong>: se sabe que
          falta algo.
        </li>
        <li>
          <strong>Ya está comprometida en otra semana.</strong>
        </li>
      </ul>
      <p>
        No se prohíbe —la obra a veces arranca igual— pero queda constancia de
        que se decidió a sabiendas.
      </p>
    </S>

    <S titulo="El valor ganado no me muestra el EAC ni el VAC">
      <p>
        Es a propósito, y llegó después de un susto: la pantalla llegó a
        anunciar en verde un ahorro de <strong>S/ 633.873</strong> en una obra
        real. Falso.
      </p>
      <p>
        El «costo estimado al final» se calcula con lo que llevas gastado. Pero
        en GCM el gasto son las <strong>órdenes de compra aprobadas</strong>, y
        las órdenes se aprueban <em>después</em> del trabajo: cuando llevabas
        S/ 62.000 ganados solo había una orden de S/ 11.000. Divide una cosa
        por la otra y sale que la obra costará la quinta parte de lo
        presupuestado. Nadie construye tan barato.
      </p>
      <p>
        Así que CPI, EAC y VAC <strong>no se muestran hasta que haya con qué
        sostenerlos</strong>: al menos un <strong>15 %</strong> de obra
        ejecutada y que el costo registrado cubra la <strong>mitad</strong> de
        lo ganado. Mientras tanto la pantalla dice por qué falta cada uno, en
        vez de dejar un guion.
      </p>
      <p>
        Lo que <strong>sí</strong> puedes leer desde el primer día:{" "}
        <strong>SPI y SV</strong> —vas adelantado o atrasado, y no dependen del
        gasto—, <strong>CV</strong> —ganado menos gastado, un hecho de hoy y no
        una predicción— y la curva de las tres líneas.
      </p>
      <p>
        <strong>Para que aparezcan antes:</strong> registra las órdenes de
        compra al día. Cuanto menos se retrase el papeleo respecto de la obra,
        antes sirve la proyección.
      </p>
    </S>

    <S titulo="La curva S dice que «no se llega». ¿Nunca?">
      <p>
        Solo cuando el ritmo es <strong>cero</strong>. Ahí es literal: sin
        avanzar nada, no se llega nunca.
      </p>
      <p>
        En cualquier otro caso la curva estima <strong>cuánto te vas a
        pasar</strong>: a mitad de ritmo, tardas el doble de lo que queda. Y el
        porcentaje de ritmo no redondea: un 99,6 % se muestra como 99,6 % y no
        como «100 %». Decirle «vas al día» a quien no va es la peor ayuda
        posible.
      </p>
    </S>
  </>
);

// ---------------------------------------------------------------------------
// Capitulo: glosario
// ---------------------------------------------------------------------------

const GLOSARIO = (
  <>
    <Clave>
      Casi todo el vocabulario de GCM viene del <strong>Last Planner</strong> y
      del <strong>valor ganado</strong>, dos métodos con décadas de obra
      detrás. No son siglas de la aplicación: son las que se usan en las
      reuniones, y por eso se respetan tal cual en vez de traducirlas a algo
      más cómodo.
    </Clave>

    <S titulo="Planificación">
      <Tabla
        cabeceras={["Término", "Qué significa"]}
        filas={[
          ["Last Planner", "Método de planificación donde quien ejecuta es quien compromete"],
          ["Lookahead", "La ventana de mediano plazo, donde se liberan restricciones"],
          ["PTS", "Plan de Trabajo Semanal: los compromisos de la semana"],
          ["PPC", "Porcentaje de Plan Cumplido: cumplidas ÷ prometidas"],
          ["CNC", "Causa de No Cumplimiento: por qué falló un compromiso"],
          ["Pareto", "El gráfico que ordena las causas de mayor a menor"],
          ["Confiabilidad", "Qué porcentaje de las tareas de la ventana está LISTA"],
        ]}
      />
    </S>

    <S titulo="Medida de la obra">
      <Tabla
        cabeceras={["Término", "Qué significa"]}
        filas={[
          ["EVM / Valor ganado", "Compara lo planificado, lo ejecutado y lo gastado"],
          ["SPI / CPI", "Índices de rendimiento de plazo y de costo"],
          ["EAC", "Lo que costará la obra al final si sigues rindiendo igual"],
          ["VAC", "Lo que sobrará (o faltará) del presupuesto al terminar"],
          ["Ritmo", "A qué porcentaje del avance previsto vas realmente"],
          ["Días laborables", "De los días que quedan, los que se trabaja según el calendario de la obra"],
        ]}
      />
    </S>

    <S titulo="Presupuesto y cronograma">
      <Tabla
        cabeceras={["Término", "Qué significa"]}
        filas={[
          ["EDT", "El árbol del presupuesto: capítulos y partidas"],
          ["UID", "El número que identifica una tarea entre versiones del cronograma"],
          ["Línea base", "El plan congelado contra el que se mide la desviación"],
          ["Bolsa", "Lo que se cobra menos lo que cuesta construir: el margen de la obra"],
          ["Comprometido", "Dinero ya pedido, aunque todavía no se haya pagado"],
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
      "ninguna), los preliminares de una constructora recién llegada y el " +
      "anclaje que dice qué toca ahora en cada obra.",
    contenido: EMPEZAR,
  },
  {
    slug: "en-obra",
    titulo: "En obra: tu día en tres pasos",
    pregunta: "qué tengo que hacer hoy",
    paraQuien: "Quien está en la obra.",
    resumen:
      "La guía de campo, en frases cortas: cómo entrar con el QR o con tu " +
      "usuario, qué se apunta y qué se deja en blanco.",
    contenido: EN_OBRA,
  },
  {
    slug: "meta",
    titulo: "El presupuesto meta",
    pregunta: "cuánto queremos gastar",
    paraQuien: "Gerencia y residencia.",
    resumen:
      "El presupuesto meta y el contractual que sale de él: la bolsa " +
      "operativa, por qué los sueldos y las pólizas también son costo de la obra y por qué la meta sí " +
      "se puede re-fijar. Cómo entra lo que cobra cada contratista —su " +
      "descuento, sus gastos generales y su utilidad— y por qué eso no se " +
      "confunde con el recargo al cliente. Y cómo traerte un presupuesto que " +
      "ya tienes en tu propio Excel, ordenarlo aquí dentro y ponerle los precios.",
    contenido: META,
  },
  {
    slug: "presupuesto",
    titulo: "La obra y su presupuesto",
    pregunta: "cuánto cuesta",
    paraQuien: "Quien crea la obra y carga su presupuesto.",
    resumen:
      "El árbol de capítulos y partidas, cómo se registra una partida a " +
      "precios unitarios o a suma alzada, cómo el contractual se genera " +
      "desde el real, la regla que impide contar dinero dos veces y la " +
      "línea base.",
    contenido: PRESUPUESTO,
  },
  {
    slug: "propuesta",
    titulo: "La propuesta para el cliente",
    pregunta: "cuánto le cobro al cliente",
    paraQuien: "Gerencia y quien cotiza.",
    resumen:
      "De costo directo a precio de venta: la cascada completa, con IGV o " +
      "con recibo por honorarios, en soles o en dólares, y con el detalle " +
      "que se decida.",
    contenido: PROPUESTA,
  },
  {
    slug: "movimientos",
    titulo: "Los movimientos: adicionales, deductivos y reconversiones",
    pregunta: "qué cambió sobre lo firmado",
    paraQuien: "Quien administra el contrato.",
    resumen:
      "Base más ajustes igual a vigente: los tres tipos de movimiento, por " +
      "qué ninguno se deshace y cuándo nacen las partidas de un adicional.",
    contenido: MOVIMIENTOS,
  },
  {
    slug: "edt",
    titulo: "Armar la EDT del presupuesto",
    pregunta: "cómo se estructura el trabajo",
    paraQuien: "Quien arma el presupuesto y quien planifica.",
    resumen:
      "La estructura de desglose del trabajo no se teclea aparte: es el " +
      "presupuesto. Qué es capítulo, qué es paquete de trabajo y qué es " +
      "tarea, cómo se numera, hasta dónde conviene descomponer, y por qué " +
      "quien lleva el precio es quien lleva la fecha.",
    contenido: EDT,
  },
  {
    slug: "cronograma",
    titulo: "El cronograma y el avance",
    pregunta: "cuándo se hace",
    paraQuien: "Quien planifica y quien reporta.",
    resumen:
      "Importar de MS Project por cortes, el avance real que manda sobre el " +
      "archivo, la curva S y los hitos.",
    contenido: CRONOGRAMA,
  },
  {
    slug: "mapeo",
    titulo: "Enlazar tareas con partidas",
    pregunta: "qué parte del presupuesto cubre cada tarea",
    paraQuien: "Oficina técnica.",
    resumen:
      "La cobertura que hace fiable el índice de costo, y por qué GCM " +
      "propone pero no enlaza solo: enlazar por código se midió y falló.",
    contenido: MAPEO,
  },
  {
    slug: "lookahead",
    titulo: "El Lookahead",
    pregunta: "qué se prepara",
    paraQuien: "Residencia.",
    resumen:
      "Mirar unas semanas adelante, destapar restricciones y liberarlas " +
      "antes de comprometer nada.",
    contenido: LOOKAHEAD,
  },
  {
    slug: "plan-semanal",
    titulo: "El plan semanal",
    pregunta: "qué se compromete",
    paraQuien: "Residencia, con la cuadrilla delante.",
    resumen:
      "Comprometer solo lo liberado, cerrar la semana, y el PPC con sus " +
      "causas de no cumplimiento.",
    contenido: PLAN_SEMANAL,
  },
  {
    slug: "kanban",
    titulo: "El Kanban de obra",
    pregunta: "en qué punto está cada tarea",
    paraQuien: "Quien está en obra y quien supervisa.",
    resumen:
      "El flujo del Last Planner en columnas, la precedencia que impide " +
      "contar dos veces el mismo trabajo y por qué no se arrastra.",
    contenido: KANBAN,
  },
  {
    slug: "parte-del-dia",
    titulo: "El parte del día",
    pregunta: "cuánto se avanzó hoy",
    paraQuien: "Quien está en obra.",
    resumen:
      "Reportar avance por tarea con sus fotos: de aquí salen la curva S, " +
      "el valor ganado y el informe semanal. Y por qué una casilla vacía " +
      "no escribe nada.",
    contenido: PARTE,
  },
  {
    slug: "notas",
    titulo: "Las notas de la obra",
    pregunta: "qué hay que no olvidar",
    paraQuien: "Quien anota: trabajo de campo. Corregir o borrar pide gestionar.",
    resumen:
      "La bitácora libre —lo que no encaja en ningún formulario reglado—, " +
      "con recordatorios que vencen solos y por qué no es lo mismo que una " +
      "Restricción del Lookahead.",
    contenido: NOTAS,
  },
  {
    slug: "personal",
    titulo: "El personal que documenta en obra",
    pregunta: "quién sube fotos desde el campo",
    paraQuien: "Residencia lo configura; el de obra lo usa.",
    resumen:
      "Los pases: entrar con el QR sin tener cuenta, por qué solo entra " +
      "quien está dado de alta, y revocar en vez de borrar.",
    contenido: PERSONAL,
  },
  {
    slug: "galeria",
    titulo: "La galería",
    pregunta: "cómo se ve la obra",
    paraQuien: "Quien documenta sube; gerencia publica.",
    resumen:
      "El escaparate que ve el cliente: se cura foto a foto, publicar es " +
      "un permiso aparte, y no tiene ningún camino desde la evidencia.",
    contenido: GALERIA,
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
      "La cadencia de cada contratista con su herencia, el panel de lo que " +
      "toca, el pago con su constancia y el aviso que solo suena si la " +
      "obra lo tiene encendido.",
    contenido: VALORIZACIONES,
  },
  {
    slug: "indicadores",
    titulo: "Leer la obra: tablero e indicadores",
    pregunta: "cómo va la obra",
    paraQuien: "Quien supervisa.",
    resumen:
      "El tablero de la obra, los semáforos, el valor ganado (SPI y CPI) y " +
      "qué significa cada rótulo — y cuándo una cifra calla a propósito.",
    contenido: INDICADORES,
  },
  {
    slug: "informe",
    titulo: "El informe semanal",
    pregunta: "qué se le entrega al cliente",
    paraQuien: "Residencia y gerencia.",
    resumen:
      "Una foto de la obra a una fecha por cinco puertas con los mismos " +
      "datos, lo que deja fuera a propósito y dónde salen (y no salen) las " +
      "fotos.",
    contenido: INFORME,
  },
  {
    slug: "gerencia",
    titulo: "Gerencia: la cartera de una mirada",
    pregunta: "cómo va la cartera",
    paraQuien: "Quien responde de todas las obras.",
    resumen:
      "Los adicionales pedidos y sin aprobar, el semáforo de partidas " +
      "críticas y el SPI por duración de cada obra.",
    contenido: GERENCIA,
  },
  {
    slug: "avisos",
    titulo: "Los avisos y el reloj",
    pregunta: "qué suena solo",
    paraQuien: "Todos.",
    resumen:
      "La campanita, el correo y el SMS: qué avisa solo, por qué los " +
      "recordatorios nacen apagados y dónde se encienden por obra.",
    contenido: AVISOS,
  },
  {
    slug: "cierre",
    titulo: "Cerrar, respaldar y restaurar",
    pregunta: "lo que ya terminó",
    paraQuien: "ADMIN.",
    resumen:
      "Qué significa cerrar una obra, el respaldo firmado, el borrado en " +
      "dos pasos y la restauración como copia de auditoría.",
    contenido: CIERRE,
  },
  {
    slug: "preguntas",
    titulo: "Preguntas frecuentes",
    pregunta: "por qué el sistema hace esto",
    paraQuien: "Todos.",
    resumen:
      "Las dudas que se repiten, con su respuesta: por qué el avance no " +
      "está en soles, por qué una tarea no pasa a LISTA, por qué el valor " +
      "ganado se calla el EAC y por qué la curva dice que no se llega.",
    contenido: PREGUNTAS,
  },
  {
    slug: "glosario",
    titulo: "Glosario",
    pregunta: "qué quiere decir esa sigla",
    paraQuien: "Todos, y sobre todo quien llega nuevo al Last Planner.",
    resumen:
      "PPC, CNC, EDT, SPI, EAC, bolsa, comprometido. El vocabulario de las " +
      "reuniones, con una línea cada uno.",
    contenido: GLOSARIO,
  },
];

export function capituloPorSlug(slug: string): CapituloManual | null {
  return CAPITULOS.find((c) => c.slug === slug) ?? null;
}
