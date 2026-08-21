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

    <S titulo="El contractual sale del real, no al revés">
      <p>
        Desde agosto de 2026 el orden es este: primero entra el{" "}
        <strong>presupuesto real</strong> —lo que de verdad cuesta ejecutar
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
            <strong>Cargar el presupuesto real</strong> en Meta, con su
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
        de un día no es lo mismo que terminar una de veinte. Es el único
        peso que trae el archivo — cuando el mapeo tarea-partida cubra
        suficiente presupuesto, el avance pasará a ponderarse por dinero y
        las cifras afinarán, sin cambiar de fórmula.
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

    <S titulo="Los gastos generales no son de la obra">
      <p>
        La meta de la obra es <strong>costo directo</strong>: las partidas que
        se ejecutan. Los <strong>gastos generales</strong> y la
        <strong>utilidad</strong> no entran en ella —los reconoce el contrato
        como un porcentaje y los gestiona la empresa—, así que la obra
        gestiona <strong>una sola bolsa</strong>: lo que se gana ejecutando
        por debajo de la meta.
      </p>
      <p>
        Por eso la plantilla del real ya no trae hoja de gastos generales. Si
        cargas un Excel antiguo que la traiga, GCM lo dice al importar en vez
        de guardarla por su cuenta.
      </p>
    </S>

    <S titulo="El recorrido de la primera vez">
      <Recorrido
        pasos={[
          <>
            <strong>Cargar el presupuesto real</strong> con la plantilla
            oficial, y revisar los totales: costo directo, gastos generales y
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

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
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
            hace: "Prometer gastos generales más largos que el plazo",
            pasa: (
              <p>
                Un gasto mensual que dura más meses que la obra es plata
                comprometida sobre un plazo que no existe. GCM cruza las
                líneas de gasto contra el plazo y señala las que se pasan,
                antes de que lo descubra el cierre.
              </p>
            ),
          },
        ]}
      />
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
      en una</strong>: cuánto hay pedido en adicionales que todavía no
      cuenta en ningún presupuesto, y qué partidas críticas van tarde en
      toda la cartera. Es de empresa, no de obra — por eso no se llama
      «tablero».
    </Clave>

    <S titulo="Quién entra: es el alcance, no un permiso">
      <p>
        La pantalla es para quien ve <strong>todas</strong> las obras. No
        hace falta un permiso nuevo: quien tiene la cartera entera asignada
        es, por definición, quien responde de ella. A quien lleva una obra,
        un resumen de las demás no le dice nada que pueda usar — y ni
        siquiera le aparece la entrada en el menú.
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
        El reloj avisa de tres cosas: las <strong>restricciones</strong> que
        llevan días abiertas o cuya fecha comprometida ya pasó (un
        recordatorio, y un resumen del día a partir de la hora que diga la
        obra); los <strong>hitos</strong> que se acercan o se pasan, con la
        fecha del cronograma vigente; y las{" "}
        <strong>valorizaciones</strong> que tocaban y no constan, que van
        solo a la campanita de los residentes de esa obra.
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
      <strong>cuánto</strong>, pero no se conocen entre sí. Enlazarlos permite
      medir el avance <strong>en soles</strong> en vez de en días. Mientras no
      haya enlaces, el avance se pondera por duración —lo único que trae el
      archivo de Project— y una partida de 500 soles pesa igual que una de
      200.000.
    </Clave>

    <S titulo="La cobertura es la cifra que manda">
      <p>
        La <strong>cobertura</strong> dice qué parte del presupuesto tiene ya
        tarea enlazada. Al pasar del <strong>60%</strong>, el avance puede
        ponderarse por dinero. Por debajo, pesar por dinero sería peor que no
        hacerlo: la cifra parece más seria y describe una quinta parte de la
        obra.
      </p>
      <p>
        Ojo con una lectura tentadora: la cobertura no es la compuerta del
        índice de costo. Que el CPI se calle al principio de la obra depende
        de otra cosa —que el costo registrado respalde lo ya ganado—, y eso se
        explica en el capítulo de indicadores. Lo que cambia aquí es{" "}
        <strong>con qué se pesa el avance</strong>, que es lo que alimenta el
        valor ganado.
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
      "El presupuesto real y el contractual que sale de él: la bolsa " +
      "operativa, por qué los gastos generales no son de la obra y por qué la meta sí " +
      "se puede re-fijar.",
    contenido: META,
  },
  {
    slug: "presupuesto",
    titulo: "La obra y su presupuesto",
    pregunta: "cuánto cuesta",
    paraQuien: "Quien crea la obra y carga su presupuesto.",
    resumen:
      "El árbol de capítulos y partidas, cómo el contractual se genera " +
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
      "La cobertura que permite pesar el avance por dinero, y por qué GCM " +
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
];

export function capituloPorSlug(slug: string): CapituloManual | null {
  return CAPITULOS.find((c) => c.slug === slug) ?? null;
}
