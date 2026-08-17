# Emisor SMS GCM

La aplicación que manda los SMS de GCM desde **tu propia línea**, sin
intermediarios y sin instalar MacroDroid ni Tasker.

No hace nada más que esto, cada veinte segundos:

1. Pregunta a GCM si hay algún SMS pendiente.
2. Lo manda con la SIM del teléfono.
3. Avisa a GCM de que salió.

## Cómo obtener el APK

**Desde el propio teléfono**, que es donde hay que instalarlo:

https://github.com/drcaceresruiz-glitch/gcm/releases/latest/download/emisor-sms.apk

Esa dirección no cambia nunca y también está enlazada dentro de GCM, en
**Empresa → Configuración**. Se puede abrir esa pantalla en el móvil.

No hace falta instalar el SDK de Android en ningún sitio: lo compila GitHub. El
flujo **APK del emisor de SMS** se lanza solo cuando cambia `movil/emisor-sms`,
o a mano desde Actions, y cada vez reemplaza el archivo de esa release. El run
deja además el APK como artefacto, útil para guardar el de una versión
concreta, pero se descarga en `.zip` y pide sesión de GitHub: para instalar,
usa el enlace de arriba.

## Cómo instalarlo

Android avisará de que viene de un origen desconocido. Es correcto: el APK
está firmado para depuración porque se instala en **un** teléfono conocido, no
se publica. Hay que permitir la instalación esa vez.

No puede ir a Google Play: Play reserva el permiso `SEND_SMS` para la
aplicación que sea el gestor de SMS por defecto del teléfono.

## Cómo configurarlo

1. Abre la app y concede los permisos que pida (SMS y notificaciones).
2. **Dirección de la cola**: `https://gcm.drcaceresruiz.com/api/sms/cola`
3. **Token**: el que da GCM al vincular este telefono, en Empresa ->
   Configuracion. Se ensena UNA vez y no se puede volver a ver; si se pierde,
   se revoca y se crea otro. Es de esa empresa y solo alcanza su cola.
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
