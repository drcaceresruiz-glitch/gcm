plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "pe.gcm.emisorsms"
    compileSdk = 35

    defaultConfig {
        applicationId = "pe.gcm.emisorsms"
        // 24 = Android 7. Cubre cualquier telefono que siga en uso en obra.
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        // Solo `debug`: el APK se instala de lado en UN telefono conocido, no
        // se publica. Firmarlo para produccion exigiria custodiar un almacen
        // de claves, que es trabajo sin beneficio para este caso.
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

/**
 * CERO dependencias, y es deliberado.
 *
 * La app hace tres cosas: un GET, un SMS y un POST. Con HttpURLConnection,
 * `org.json` y `SmsManager` —los tres dentro de Android— no hace falta nada
 * mas. Cada libreria que se anadiera seria una version que mantener y una
 * forma nueva de que la compilacion se rompa dentro de un ano, cuando nadie
 * se acuerde de que esto existe.
 */
dependencies {}
