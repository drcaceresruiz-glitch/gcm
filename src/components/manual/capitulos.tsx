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
// Capitulo: el cronograma y el avance
// ---------------------------------------------------------------------------

const CRONOGRAMA = (
  <>
    <Clave>
      El plan lo manda MS Project; el avance real, GCM. El cronograma entra
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
      El contractual dice lo que el cliente paga; la <strong>meta</strong>,
      lo que tu empresa se compromete a gastar para ejecutarlo. La distancia
      entre las dos es la <strong>bolsa operativa</strong>: el margen con el
      que la obra respira. Sin meta, «vamos bien de plata» es una opinión.
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
        Cada versión de la meta recuerda contra qué contractual se fijó y
        cuántos movimientos había entonces: si después entran más, la
        pantalla avisa del desfase — es la señal de que toca re-fijar.
      </p>
    </S>

    <S titulo="La decisión previa: los gastos generales">
      <p>
        Antes de leer ninguna bolsa, la obra pregunta{" "}
        <strong>una sola vez</strong> si los gastos generales cuentan dentro
        de ella o quedan fuera. No trae valor por defecto porque es una
        decisión de cada constructora y de cada contrato: hay empresas donde
        los gastos generales y la utilidad no son de la obra, y solo se
        tocan con permiso del gerente general. Mientras nadie decida, GCM no
        enseña margen — una cifra calculada con un criterio que nadie
        confirmó es peor que ninguna.
      </p>
      <p>
        El criterio es de <strong>presentación, no de datos</strong>: los
        gastos se cargan y se guardan igual, decida lo que se decida, y por
        eso se puede cambiar después sin migrar nada.
      </p>
    </S>

    <S titulo="El recorrido de la primera vez">
      <Recorrido
        pasos={[
          <>
            <strong>Aprobar antes el contractual</strong> (la revisión):
            la meta se fija contra él, y sin esa referencia no hay contra
            qué comparar.
          </>,
          <>
            <strong>Decidir el criterio</strong> de los gastos generales
            cuando la obra lo pregunte. Es un aviso que no se quita solo: se
            quita decidiendo.
          </>,
          <>
            <strong>Cargar la meta</strong> — con su plantilla oficial, como
            todo lo que se importa — y revisar los totales: costo directo,
            gastos generales y plazo en meses.
          </>,
          <>
            <strong>Aprobarla</strong> para congelarla. Desde ahí la bolsa
            se lee sola: contractual vigente contra meta, con el criterio
            que se decidió.
          </>,
        ]}
      />
    </S>

    <S titulo="Lo que sale mal">
      <SaleMal
        casos={[
          {
            hace: "Leer la bolsa sin haber decidido el criterio de gastos generales",
            pasa: (
              <p>
                GCM no lo permite, y ese es el punto: dos criterios dan dos
                márgenes distintos con los mismos números, y una obra puede
                parecer holgada o ahogada según cuál se asuma sin decir.
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
        <strong>la tarea y la fecha</strong>. Después aparecen en el informe
        semanal y pueden pasar a la <strong>galería</strong>, que es el
        escaparate que —si la obra lo comparte— <strong>ve el
        cliente</strong>. Conviene saberlo antes de subir: lo que se sube es
        evidencia de obra, no un archivo privado.
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
    contenido: CRONOGRAMA,
  },
  {
    slug: "meta",
    titulo: "El presupuesto meta",
    pregunta: "cuánto queremos gastar",
    paraQuien: "Gerencia y residencia.",
    resumen:
      "El contractual contra el meta: la bolsa operativa, el criterio de " +
      "los gastos generales y por qué la meta sí se puede re-fijar.",
    contenido: META,
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
