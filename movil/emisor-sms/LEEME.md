# Emisor SMS GCM

La aplicación que manda los SMS de GCM desde **tu propia línea**, sin
intermediarios y sin instalar MacroDroid ni Tasker.

No hace nada más que esto, cada veinte segundos:

1. Pregunta a GCM si hay algún SMS pendiente.
2. Lo manda con la SIM del teléfono.
3. Avisa a GCM de que salió.

## Cómo obtener el APK

No hace falta instalar el SDK de Android en ningún sitio: lo compila GitHub.

1. En GitHub → pestaña **Actions** → **APK del emisor de SMS** → **Run
   workflow**.
2. Cuando termine (unos minutos), abre el run y descarga el artefacto
   `emisor-sms-apk`.
3. Descomprime y pasa el `.apk` al teléfono.

## Cómo instalarlo

Android avisará de que viene de un origen desconocido. Es correcto: el APK
está firmado para depuración porque se instala en **un** teléfono conocido, no
se publica. Hay que permitir la instalación esa vez.

No puede ir a Google Play: Play reserva el permiso `SEND_SMS` para la
aplicación que sea el gestor de SMS por defecto del teléfono.

## Cómo configurarlo

1. Abre la app y concede los permisos que pida (SMS y notificaciones).
2. **Dirección de la cola**: `https://gcm.drcaceresruiz.com/api/sms/cola`
3. **Token**: el mismo valor que pusiste en `SMS_COLA_TOKEN` en cPanel.
4. Pulsa **Encender**.
5. Pulsa **Quitar el ahorro de batería** y acepta.

El paso 5 no es opcional. Sin él, Android duerme la aplicación cuando se apaga
la pantalla y los códigos dejan de salir sin ningún aviso — es el fallo más
difícil de descubrir, porque todo *parece* estar encendido.

En teléfonos Xiaomi, Huawei, Oppo o Samsung hay **además** una lista propia del
fabricante («inicio automático», «aplicaciones protegidas», «sin
restricciones»). Esa no se puede abrir desde la app y hay que buscarla a mano
en los ajustes del teléfono.

## Cómo saber si está funcionando

La notificación permanente dice lo último que hizo: `Sin mensajes · 14:32`,
`Enviados 1/1 · 14:33` o el error que sea. Si la hora no avanza, la app está
dormida.

## Qué hacer si un SMS no llega

No pasa nada grave, y está previsto:

- GCM vuelve a ofrecer el mensaje a los 90 segundos si el teléfono no confirmó
  que salió (hasta cinco veces). Recibir dos veces el mismo código es
  inofensivo; no recibirlo, no.
- El código también se envía **por correo**.
- Y quien lleva la obra puede generarlo en su pantalla y dictarlo, desde
  Personal → Generar código.

Por eso el teléfono no es un punto único de fallo para la obra, aunque sí lo
sea para el canal SMS.

## Lo que este teléfono ve

Los códigos de acceso del personal, en claro, durante los segundos que pasan
entre que GCM los encola y el SMS sale. Es la contrapartida de no depender de
un proveedor externo, y quien tenga ese teléfono en la mano puede leerlos.
Tenlo donde tendrías las llaves de la obra.

## Estructura

    app/src/main/java/pe/gcm/emisorsms/
      MainActivity.kt     la única pantalla: configurar y encender
      ServicioEmisor.kt   el bucle que pregunta, manda y confirma
      ClienteCola.kt      las dos llamadas a GCM
      Ajustes.kt          dirección, token y si está encendido
      ReceptorArranque.kt volver solo tras reiniciar el teléfono

Sin dependencias de terceros: `HttpURLConnection`, `org.json` y `SmsManager`
vienen dentro de Android. Cada librería añadida sería una versión que mantener
y una forma nueva de que esto no compile dentro de un año.
