package pe.gcm.emisorsms

import android.content.Context

/**
 * Lo que hay que configurar una vez: a que servidor preguntar y con que
 * credencial.
 *
 * Se guarda en las preferencias privadas de la app. En un telefono sin rootear
 * ninguna otra aplicacion puede leerlas, que es la garantia razonable aqui; no
 * se usa cifrado adicional porque la clave tendria que vivir en el mismo
 * telefono y no anadiria nada real.
 */
class Ajustes(contexto: Context) {

    private val prefs =
        contexto.getSharedPreferences("emisor-sms", Context.MODE_PRIVATE)

    var url: String
        get() = prefs.getString(CLAVE_URL, "") ?: ""
        set(valor) = prefs.edit().putString(CLAVE_URL, valor.trim()).apply()

    var token: String
        get() = prefs.getString(CLAVE_TOKEN, "") ?: ""
        set(valor) = prefs.edit().putString(CLAVE_TOKEN, valor.trim()).apply()

    /// Si el servicio debe estar corriendo. Sobrevive al reinicio del
    /// telefono, que es lo que lee `ReceptorArranque` para volver solo.
    var activo: Boolean
        get() = prefs.getBoolean(CLAVE_ACTIVO, false)
        set(valor) = prefs.edit().putBoolean(CLAVE_ACTIVO, valor).apply()

    /// Ultima linea de estado, para poder mirar el telefono y saber que pasa
    /// sin conectar nada.
    var estado: String
        get() = prefs.getString(CLAVE_ESTADO, "Sin arrancar") ?: "Sin arrancar"
        set(valor) = prefs.edit().putString(CLAVE_ESTADO, valor).apply()

    fun configurado(): Boolean = url.isNotBlank() && token.isNotBlank()

    private companion object {
        const val CLAVE_URL = "url"
        const val CLAVE_TOKEN = "token"
        const val CLAVE_ACTIVO = "activo"
        const val CLAVE_ESTADO = "estado"
    }
}
