package pe.gcm.emisorsms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.telephony.SmsManager
import android.util.Log

/**
 * El que pregunta, manda y confirma. Corre en primer plano y no para.
 *
 * POR QUE UN SERVICIO EN PRIMER PLANO, con su notificacion permanente
 * incluida: es la unica forma de que Android no mate el proceso. Un
 * `WorkManager` no sirve porque su intervalo minimo es de quince minutos, y un
 * codigo que caduca en diez llegaria tarde. Un hilo suelto en segundo plano lo
 * mata el sistema en cuanto la pantalla se apaga.
 *
 * Aun asi, en telefonos de algunos fabricantes —Xiaomi, Huawei, Oppo— hace
 * falta ADEMAS quitarle la optimizacion de bateria a mano. La pantalla
 * principal lo pide; si no se concede, la app funciona mientras la pantalla
 * este encendida y se duerme despues, que es justo el fallo dificil de
 * diagnosticar.
 *
 * El bucle es un hilo con `sleep`, sin corrutinas: son dos llamadas cada
 * veinte segundos y no merece una dependencia mas.
 */
class ServicioEmisor : Service() {

    private var hilo: Thread? = null
    @Volatile private var corriendo = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        crearCanal()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (corriendo) return START_STICKY

        startForeground(ID_NOTIFICACION, notificacion("Vigilando la cola"))
        corriendo = true

        hilo = Thread { bucle() }.also { it.start() }

        // START_STICKY: si el sistema nos mata por memoria, que nos vuelva a
        // levantar en cuanto pueda.
        return START_STICKY
    }

    override fun onDestroy() {
        corriendo = false
        hilo?.interrupt()
        super.onDestroy()
    }

    private fun bucle() {
        val ajustes = Ajustes(this)

        while (corriendo) {
            try {
                if (ajustes.configurado()) {
                    unaVuelta(ajustes)
                } else {
                    anotar(ajustes, "Falta configurar la direccion o el token")
                }
            } catch (e: Exception) {
                // Nada puede tumbar el bucle: si se cae, deja de salir todo y
                // nadie se entera hasta que alguien no puede entrar a la obra.
                Log.e(TAG, "Vuelta fallida", e)
                anotar(ajustes, "Error: ${e.message}")
            }

            try {
                Thread.sleep(INTERVALO_MS)
            } catch (e: InterruptedException) {
                return
            }
        }
    }

    private fun unaVuelta(ajustes: Ajustes) {
        val cliente = ClienteCola(ajustes.url, ajustes.token)
        val pendientes = cliente.pendientes()

        if (pendientes.isEmpty()) {
            anotar(ajustes, "Sin mensajes · ${horaActual()}")
            return
        }

        val enviados = mutableListOf<String>()
        for (m in pendientes) {
            if (enviar(m)) enviados.add(m.id)
        }

        // Se confirma SOLO lo que de verdad salio. Lo que fallo se quedara sin
        // confirmar y GCM lo volvera a ofrecer cuando venza el prestamo.
        if (enviados.isNotEmpty()) cliente.confirmar(enviados)

        anotar(
            ajustes,
            "Enviados ${enviados.size}/${pendientes.size} · ${horaActual()}",
        )
    }

    private fun enviar(m: MensajePendiente): Boolean {
        return try {
            val gestor =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    getSystemService(SmsManager::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    SmsManager.getDefault()
                }

            // Se parte si pasa de 160 caracteres. Los mensajes de GCM son
            // cortos a proposito, pero si algun dia crecen, esto evita que
            // lleguen truncados en vez de fallar.
            val partes = gestor.divideMessage(m.texto)
            if (partes.size > 1) {
                gestor.sendMultipartTextMessage(m.numero, null, partes, null, null)
            } else {
                gestor.sendTextMessage(m.numero, null, m.texto, null, null)
            }
            true
        } catch (e: Exception) {
            Log.e(TAG, "No se pudo enviar a ${m.numero}", e)
            false
        }
    }

    private fun anotar(ajustes: Ajustes, texto: String) {
        ajustes.estado = texto
        val gestor = getSystemService(NotificationManager::class.java)
        gestor?.notify(ID_NOTIFICACION, notificacion(texto))
    }

    private fun crearCanal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val canal = NotificationChannel(
            CANAL,
            "Emisor de SMS",
            // Baja: la notificacion tiene que estar, pero no sonar cada vez.
            NotificationManager.IMPORTANCE_LOW,
        )
        getSystemService(NotificationManager::class.java)?.createNotificationChannel(canal)
    }

    private fun notificacion(texto: String): Notification {
        val abrir = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )

        val constructor =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Notification.Builder(this, CANAL)
            } else {
                @Suppress("DEPRECATION")
                Notification.Builder(this)
            }

        return constructor
            .setContentTitle("Emisor SMS GCM")
            .setContentText(texto)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentIntent(abrir)
            .setOngoing(true)
            .build()
    }

    private fun horaActual(): String {
        val ahora = java.util.Calendar.getInstance()
        return String.format(
            java.util.Locale.US,
            "%02d:%02d",
            ahora.get(java.util.Calendar.HOUR_OF_DAY),
            ahora.get(java.util.Calendar.MINUTE),
        )
    }

    companion object {
        private const val TAG = "EmisorSMS"
        private const val CANAL = "emisor"
        private const val ID_NOTIFICACION = 1

        /// Veinte segundos. El codigo del pase dura diez minutos, asi que esto
        /// da de sobra; bajarlo solo gastaria bateria y datos.
        private const val INTERVALO_MS = 20_000L

        fun arrancar(contexto: android.content.Context) {
            val intent = Intent(contexto, ServicioEmisor::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                contexto.startForegroundService(intent)
            } else {
                contexto.startService(intent)
            }
        }

        fun parar(contexto: android.content.Context) {
            contexto.stopService(Intent(contexto, ServicioEmisor::class.java))
        }
    }
}
