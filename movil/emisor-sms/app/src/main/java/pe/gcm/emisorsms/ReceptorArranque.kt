package pe.gcm.emisorsms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Vuelve a arrancar el servicio cuando el telefono se reinicia.
 *
 * Sin esto, un corte de luz en la caseta —o alguien que apaga el movil para
 * cargarlo— dejaria la obra sin SMS hasta que alguien se acordara de abrir la
 * app. Nadie se acuerda.
 *
 * Solo arranca si estaba encendido antes: `Ajustes.activo` guarda la decision
 * del usuario, no el estado del proceso.
 */
class ReceptorArranque : BroadcastReceiver() {

    override fun onReceive(contexto: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        val ajustes = Ajustes(contexto)
        if (ajustes.activo && ajustes.configurado()) {
            ServicioEmisor.arrancar(contexto)
        }
    }
}
