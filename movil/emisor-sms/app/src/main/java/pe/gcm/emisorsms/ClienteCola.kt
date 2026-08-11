package pe.gcm.emisorsms

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

/** Un SMS que GCM quiere que salga. */
data class MensajePendiente(val id: String, val numero: String, val texto: String)

/**
 * Habla con la cola de GCM. Dos llamadas y nada mas.
 *
 * Con `HttpURLConnection` y `org.json`, que vienen dentro de Android: una
 * libreria de red aqui seria una dependencia que mantener para ahorrar quince
 * lineas.
 *
 * Ningun metodo lanza. Un telefono en obra pierde cobertura constantemente, y
 * un fallo de red no es un error: es el estado normal cada pocos minutos.
 */
class ClienteCola(private val url: String, private val token: String) {

    /** Lo que haya que mandar. Lista vacia si no hay nada o si fallo. */
    fun pendientes(): List<MensajePendiente> {
        val cuerpo = pedir("GET", null) ?: return emptyList()

        return try {
            val mensajes = JSONObject(cuerpo).optJSONArray("mensajes")
                ?: return emptyList()

            (0 until mensajes.length()).mapNotNull { i ->
                val m = mensajes.optJSONObject(i) ?: return@mapNotNull null
                val id = m.optString("id")
                val numero = m.optString("numero")
                val texto = m.optString("texto")
                if (id.isBlank() || numero.isBlank() || texto.isBlank()) null
                else MensajePendiente(id, numero, texto)
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    /**
     * Avisa de que estos SMS ya salieron.
     *
     * Si esto falla, GCM volvera a ofrecer los mismos mensajes cuando venza el
     * prestamo y se mandaran dos veces. Es a proposito: recibir dos veces el
     * mismo codigo es inofensivo, no recibirlo no.
     */
    fun confirmar(ids: List<String>): Boolean {
        if (ids.isEmpty()) return true

        val cuerpo = JSONObject().put("enviados", JSONArray(ids)).toString()
        return pedir("POST", cuerpo) != null
    }

    private fun pedir(metodo: String, cuerpo: String?): String? {
        var conexion: HttpURLConnection? = null
        return try {
            conexion = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = metodo
                // La credencial va en la cabecera y NUNCA en la URL: los
                // servidores escriben las URL en su log de accesos.
                setRequestProperty("Authorization", "Bearer $token")
                setRequestProperty("Accept", "application/json")
                connectTimeout = 15_000
                readTimeout = 15_000
                if (cuerpo != null) {
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                }
            }

            if (cuerpo != null) {
                conexion.outputStream.use { it.write(cuerpo.toByteArray()) }
            }

            if (conexion.responseCode !in 200..299) return null

            conexion.inputStream.bufferedReader().use(BufferedReader::readText)
        } catch (e: Exception) {
            null
        } finally {
            conexion?.disconnect()
        }
    }
}
