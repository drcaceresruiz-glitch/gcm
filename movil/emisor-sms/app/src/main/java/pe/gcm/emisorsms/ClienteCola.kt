package pe.gcm.emisorsms

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

/** Un SMS que GCM quiere que salga. */
data class MensajePendiente(val id: String, val numero: String, val texto: String)

/**
 * Lo que devuelve la consulta a la cola.
 *
 * Distinguir «no hay nada» de «fallo» NO es un lujo: son los dos estados que
 * mas se parecen desde fuera y los que hay que separar para poder diagnosticar
 * algo. Sin esto, un token mal pegado, una tabla que no existe o un telefono
 * sin cobertura se veian los tres igual que una cola vacia, y la unica pista
 * era que los SMS no llegaban.
 */
sealed class Respuesta {
    data class Mensajes(val lista: List<MensajePendiente>) : Respuesta()

    /** El servidor contesto, pero con un codigo que no es 2xx. */
    data class Rechazo(val codigo: Int) : Respuesta()

    /** No se pudo ni preguntar: sin datos, sin cobertura, direccion mala. */
    data class SinRed(val detalle: String) : Respuesta()
}

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

    /** Lo que haya que mandar, o por que no se pudo saber. */
    fun pendientes(): Respuesta {
        val r = pedir("GET", null)

        val cuerpo = when (r) {
            is Cruda.Ok -> r.cuerpo
            is Cruda.Codigo -> return Respuesta.Rechazo(r.codigo)
            is Cruda.Error -> return Respuesta.SinRed(r.detalle)
        }

        return try {
            val mensajes = JSONObject(cuerpo).optJSONArray("mensajes")
                ?: return Respuesta.Mensajes(emptyList())

            Respuesta.Mensajes(
                (0 until mensajes.length()).mapNotNull { i ->
                    val m = mensajes.optJSONObject(i) ?: return@mapNotNull null
                    val id = m.optString("id")
                    val numero = m.optString("numero")
                    val texto = m.optString("texto")
                    if (id.isBlank() || numero.isBlank() || texto.isBlank()) null
                    else MensajePendiente(id, numero, texto)
                },
            )
        } catch (e: Exception) {
            Respuesta.SinRed("respuesta ilegible")
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
        return pedir("POST", cuerpo) is Cruda.Ok
    }

    /// El resultado de una llamada, antes de interpretarla.
    private sealed class Cruda {
        data class Ok(val cuerpo: String) : Cruda()
        data class Codigo(val codigo: Int) : Cruda()
        data class Error(val detalle: String) : Cruda()
    }

    private fun pedir(metodo: String, cuerpo: String?): Cruda {
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

            val codigo = conexion.responseCode
            if (codigo !in 200..299) return Cruda.Codigo(codigo)

            Cruda.Ok(conexion.inputStream.bufferedReader().use(BufferedReader::readText))
        } catch (e: Exception) {
            Cruda.Error(e.javaClass.simpleName)
        } finally {
            conexion?.disconnect()
        }
    }
}
