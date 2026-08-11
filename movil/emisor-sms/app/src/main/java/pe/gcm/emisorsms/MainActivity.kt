package pe.gcm.emisorsms

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

/**
 * La unica pantalla: configurar una vez, encender, y no volver a abrirla.
 *
 * La interfaz se construye en codigo y no en XML porque son seis controles y
 * asi no hay layouts que mantener. Esto no es una app de producto: es una
 * herramienta para UN telefono que vive en una caseta.
 */
class MainActivity : Activity() {

    private lateinit var ajustes: Ajustes
    private lateinit var campoUrl: EditText
    private lateinit var campoToken: EditText
    private lateinit var etiquetaEstado: TextView
    private lateinit var boton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ajustes = Ajustes(this)

        val margen = (resources.displayMetrics.density * 16).toInt()
        val columna = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(margen, margen, margen, margen)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            )
        }

        columna.addView(TextView(this).apply {
            text = "Este teléfono manda los SMS de GCM con su propia línea. " +
                "Déjalo enchufado y con saldo."
            setPadding(0, 0, 0, margen)
        })

        columna.addView(TextView(this).apply { text = "Dirección de la cola" })
        campoUrl = EditText(this).apply {
            hint = "https://gcm.drcaceresruiz.com/api/sms/cola"
            setText(ajustes.url)
            inputType = InputType.TYPE_TEXT_VARIATION_URI
        }
        columna.addView(campoUrl)

        columna.addView(TextView(this).apply {
            text = "Token"
            setPadding(0, margen, 0, 0)
        })
        campoToken = EditText(this).apply {
            hint = "el valor de SMS_COLA_TOKEN"
            setText(ajustes.token)
            // Se oculta al escribirlo: alguien puede estar mirando la pantalla
            // mientras se configura en la caseta.
            inputType = InputType.TYPE_CLASS_TEXT or
                InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        columna.addView(campoToken)

        boton = Button(this).apply {
            setPadding(0, margen, 0, 0)
            setOnClickListener { alPulsar() }
        }
        columna.addView(boton)

        etiquetaEstado = TextView(this).apply { setPadding(0, margen, 0, 0) }
        columna.addView(etiquetaEstado)

        columna.addView(Button(this).apply {
            text = "Quitar el ahorro de batería"
            setOnClickListener { pedirExencionDeBateria() }
        })

        columna.addView(TextView(this).apply {
            text = "\nSi no quitas el ahorro de batería, el sistema dormirá la " +
                "app con la pantalla apagada y los códigos dejarán de salir. " +
                "Es el fallo más difícil de descubrir."
            setPadding(0, margen, 0, 0)
        })

        setContentView(ScrollView(this).apply { addView(columna) })

        pedirPermisos()
        refrescar()
    }

    override fun onResume() {
        super.onResume()
        refrescar()
    }

    private fun refrescar() {
        boton.text = if (ajustes.activo) "Detener" else "Encender"
        etiquetaEstado.text = "Estado: ${ajustes.estado}"
    }

    private fun alPulsar() {
        if (ajustes.activo) {
            ajustes.activo = false
            ServicioEmisor.parar(this)
            ajustes.estado = "Detenido"
            refrescar()
            return
        }

        ajustes.url = campoUrl.text.toString()
        ajustes.token = campoToken.text.toString()

        if (!ajustes.configurado()) {
            avisar("Faltan la dirección y el token")
            return
        }
        if (!tienePermisoDeSms()) {
            avisar("Falta el permiso para enviar SMS")
            pedirPermisos()
            return
        }

        ajustes.activo = true
        ServicioEmisor.arrancar(this)
        ajustes.estado = "Arrancando…"
        refrescar()
    }

    private fun tienePermisoDeSms(): Boolean =
        checkSelfPermission(Manifest.permission.SEND_SMS) ==
            PackageManager.PERMISSION_GRANTED

    private fun pedirPermisos() {
        val faltan = mutableListOf<String>()
        if (!tienePermisoDeSms()) faltan.add(Manifest.permission.SEND_SMS)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            faltan.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        if (faltan.isNotEmpty()) requestPermissions(faltan.toTypedArray(), 1)
    }

    /**
     * Lleva al dialogo del sistema para eximir la app del ahorro de bateria.
     *
     * Es lo que decide si esto funciona de verdad o solo con la pantalla
     * encendida. Algunos fabricantes tienen ADEMAS su propia lista aparte
     * («inicio automatico», «apps protegidas»), que no se puede abrir desde
     * aqui y hay que buscar a mano en Ajustes.
     */
    private fun pedirExencionDeBateria() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return

        val energia = getSystemService(PowerManager::class.java)
        if (energia?.isIgnoringBatteryOptimizations(packageName) == true) {
            avisar("Ya está exenta")
            return
        }

        try {
            startActivity(
                Intent(
                    Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:$packageName"),
                ),
            )
        } catch (e: Exception) {
            // No todos los sistemas exponen ese dialogo.
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    private fun avisar(texto: String) {
        Toast.makeText(this, texto, Toast.LENGTH_LONG).show()
    }
}
