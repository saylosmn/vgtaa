package mn.ugtaa.app.mascot

import kotlin.math.cos
import kotlin.math.sin

/** Кватернион (x, y, z, w) ба баганачилсан 4×4 матрицын жижиг туслахууд. Хуваарилалтгүй (GC-гүй). */
internal object Transform {

    /** out = a ⊗ b (эхлээд b, дараа нь a эргүүлэлт). out нь a, b-тэй давхцаж болно. */
    fun quatMul(a: FloatArray, b: FloatArray, out: FloatArray) {
        val x = a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1]
        val y = a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0]
        val z = a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3]
        val w = a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
        out[0] = x; out[1] = y; out[2] = z; out[3] = w
    }

    /** Нэгж тэнхлэгийг тойрох эргүүлэлт. */
    fun axisAngle(ax: Float, ay: Float, az: Float, angle: Float, out: FloatArray) {
        val s = sin(angle / 2)
        out[0] = ax * s; out[1] = ay * s; out[2] = az * s; out[3] = cos(angle / 2)
    }

    /** Эцгийн орон зайд тэнхлэгийг тойруулан rest эргүүлэлтийн өмнө нэмнэ: out = axis(angle) ⊗ rest */
    fun preRotate(rest: FloatArray, ax: Float, ay: Float, az: Float, angle: Float, tmp: FloatArray, out: FloatArray) {
        axisAngle(ax, ay, az, angle, tmp)
        quatMul(tmp, rest, out)
    }

    fun compose(t: FloatArray, q: FloatArray, s: FloatArray, out: FloatArray) {
        val x = q[0]; val y = q[1]; val z = q[2]; val w = q[3]
        val xx = x * x; val yy = y * y; val zz = z * z
        val xy = x * y; val xz = x * z; val yz = y * z
        val wx = w * x; val wy = w * y; val wz = w * z
        out[0] = (1 - 2 * (yy + zz)) * s[0]; out[1] = 2 * (xy + wz) * s[0]; out[2] = 2 * (xz - wy) * s[0]; out[3] = 0f
        out[4] = 2 * (xy - wz) * s[1]; out[5] = (1 - 2 * (xx + zz)) * s[1]; out[6] = 2 * (yz + wx) * s[1]; out[7] = 0f
        out[8] = 2 * (xz + wy) * s[2]; out[9] = 2 * (yz - wx) * s[2]; out[10] = (1 - 2 * (xx + yy)) * s[2]; out[11] = 0f
        out[12] = t[0]; out[13] = t[1]; out[14] = t[2]; out[15] = 1f
    }

    /** out = a · b (баганачилсан). out нь a, b-тэй давхцаж болохгүй. */
    fun mul(a: FloatArray, b: FloatArray, out: FloatArray) {
        for (c in 0 until 4) {
            val b0 = b[c * 4]; val b1 = b[c * 4 + 1]; val b2 = b[c * 4 + 2]; val b3 = b[c * 4 + 3]
            for (r in 0 until 4) {
                out[c * 4 + r] = a[r] * b0 + a[4 + r] * b1 + a[8 + r] * b2 + a[12 + r] * b3
            }
        }
    }

    /** Нормалийн матриц: 4×4-ийн зүүн дээд 3×3-ын урвуугийн транспоз (баганачилсан 3×3). */
    fun normalMatrix(m: FloatArray, out: FloatArray) {
        val a = m[0]; val b = m[4]; val c = m[8]
        val d = m[1]; val e = m[5]; val f = m[9]
        val g = m[2]; val h = m[6]; val i = m[10]
        // Кофактор C_rc; (M⁻¹)ᵀ = C / det. out нь баганачилсан: out[col*3 + row] = C_row,col / det
        val c00 = e * i - f * h; val c01 = -(d * i - f * g); val c02 = d * h - e * g
        val c10 = -(b * i - c * h); val c11 = a * i - c * g; val c12 = -(a * h - b * g)
        val c20 = b * f - c * e; val c21 = -(a * f - c * d); val c22 = a * e - b * d
        val det = a * c00 + b * c01 + c * c02
        val inv = if (det == 0f) 0f else 1f / det
        out[0] = c00 * inv; out[1] = c10 * inv; out[2] = c20 * inv
        out[3] = c01 * inv; out[4] = c11 * inv; out[5] = c21 * inv
        out[6] = c02 * inv; out[7] = c12 * inv; out[8] = c22 * inv
    }

    fun transformPoint(m: FloatArray, v: FloatArray, out: FloatArray) {
        val x = v[0]; val y = v[1]; val z = v[2]
        out[0] = m[0] * x + m[4] * y + m[8] * z + m[12]
        out[1] = m[1] * x + m[5] * y + m[9] * z + m[13]
        out[2] = m[2] * x + m[6] * y + m[10] * z + m[14]
    }
}
