package mn.ugtaa.app.mascot

import org.json.JSONArray
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * design/build_assets.py-ийн гаргасан assets/taa.glb-ийг уншихад хангалттай, жижиг glTF 2.0 уншигч.
 * Дэмжих зүйлс: GLB, зангилааны шатлал (TRS/matrix), индекстэй гурвалжин, POSITION + NORMAL,
 * KHR_mesh_quantization (int16/int8 normalized), pbr baseColor/roughness, emissive (+strength).
 * Бүтэц (текстур, skin, анимаци) байхгүй — дүрийн хөдөлгөөнийг MascotRenderer кодоор хийнэ.
 */
class Gltf private constructor(
    val nodes: List<Node>,
    val roots: IntArray,
    val meshes: List<List<Primitive>>,
    val materials: List<Material>,
    val accessors: List<Accessor>,
    val bufferViews: List<BufferView>,
    val bin: ByteBuffer,
) {
    class Node(
        val name: String,
        val mesh: Int,
        val children: IntArray,
        val translation: FloatArray,
        val rotation: FloatArray, // x, y, z, w
        val scale: FloatArray,
        val matrix: FloatArray?,  // баганачилсан 4×4; байвал TRS-ийг орлоно
    )

    class Primitive(val position: Int, val normal: Int, val indices: Int, val material: Int, val mode: Int)

    class Accessor(
        val bufferView: Int,
        val byteOffset: Int,
        val componentType: Int,
        val normalized: Boolean,
        val count: Int,
        val components: Int,
    )

    class BufferView(val byteOffset: Int, val byteLength: Int, val byteStride: Int)

    class Material(val baseColor: FloatArray, val emissive: FloatArray, val roughness: Float)

    fun nodeIndex(name: String): Int = nodes.indexOfFirst { it.name == name }

    /** Accessor-ийн нэг элементийн байт хэмжээ (stride өгөгдөөгүй үед). */
    fun elementSize(a: Accessor): Int = componentBytes(a.componentType) * a.components

    /** Байрлал/нормалийг float болгож тайлна (хүрээ тооцоход, тестэд). */
    fun readVec(accessor: Int, index: Int, out: FloatArray) {
        val a = accessors[accessor]
        val bv = bufferViews[a.bufferView]
        val stride = if (bv.byteStride > 0) bv.byteStride else elementSize(a)
        val base = bv.byteOffset + a.byteOffset + index * stride
        val cb = componentBytes(a.componentType)
        for (c in 0 until a.components) {
            val p = base + c * cb
            out[c] = when (a.componentType) {
                FLOAT -> bin.getFloat(p)
                BYTE -> bin.get(p).toFloat().let { if (a.normalized) maxOf(it / 127f, -1f) else it }
                UNSIGNED_BYTE -> (bin.get(p).toInt() and 0xFF).toFloat().let { if (a.normalized) it / 255f else it }
                SHORT -> bin.getShort(p).toFloat().let { if (a.normalized) maxOf(it / 32767f, -1f) else it }
                UNSIGNED_SHORT -> (bin.getShort(p).toInt() and 0xFFFF).toFloat().let { if (a.normalized) it / 65535f else it }
                else -> error("componentType ${a.componentType}")
            }
        }
    }

    companion object {
        const val BYTE = 5120
        const val UNSIGNED_BYTE = 5121
        const val SHORT = 5122
        const val UNSIGNED_SHORT = 5123
        const val UNSIGNED_INT = 5125
        const val FLOAT = 5126

        private const val MAGIC = 0x46546C67 // "glTF"
        private const val CHUNK_JSON = 0x4E4F534A
        private const val CHUNK_BIN = 0x004E4942

        fun componentBytes(type: Int) = when (type) {
            BYTE, UNSIGNED_BYTE -> 1
            SHORT, UNSIGNED_SHORT -> 2
            UNSIGNED_INT, FLOAT -> 4
            else -> error("componentType $type")
        }

        fun parse(bytes: ByteArray): Gltf {
            val bb = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
            require(bytes.size >= 20 && bb.getInt(0) == MAGIC) { "GLB биш файл" }
            require(bb.getInt(4) == 2) { "glTF 2.0 шаардлагатай" }
            val length = minOf(bb.getInt(8), bytes.size)
            var json: JSONObject? = null
            var bin: ByteBuffer? = null
            var p = 12
            while (p + 8 <= length) {
                val len = bb.getInt(p)
                val type = bb.getInt(p + 4)
                val start = p + 8
                require(len >= 0 && start + len <= length) { "GLB chunk эвдэрсэн" }
                when (type) {
                    CHUNK_JSON -> json = JSONObject(String(bytes, start, len, Charsets.UTF_8))
                    CHUNK_BIN -> bin = ByteBuffer.wrap(bytes, start, len).slice().order(ByteOrder.LITTLE_ENDIAN)
                }
                p = start + ((len + 3) and 3.inv())
            }
            return fromJson(requireNotNull(json) { "JSON chunk алга" }, requireNotNull(bin) { "BIN chunk алга" })
        }

        private fun fromJson(j: JSONObject, bin: ByteBuffer): Gltf {
            val required = j.optJSONArray("extensionsRequired").strings()
            val unsupported = required - setOf("KHR_mesh_quantization")
            require(unsupported.isEmpty()) { "Дэмжигдээгүй өргөтгөл: $unsupported" }

            val bufferViews = j.optJSONArray("bufferViews").objects().map {
                BufferView(it.optInt("byteOffset", 0), it.getInt("byteLength"), it.optInt("byteStride", 0))
            }
            val accessors = j.optJSONArray("accessors").objects().map {
                Accessor(
                    bufferView = it.optInt("bufferView", -1),
                    byteOffset = it.optInt("byteOffset", 0),
                    componentType = it.getInt("componentType"),
                    normalized = it.optBoolean("normalized", false),
                    count = it.getInt("count"),
                    components = when (it.getString("type")) {
                        "SCALAR" -> 1; "VEC2" -> 2; "VEC3" -> 3; "VEC4" -> 4; "MAT4" -> 16
                        else -> error("accessor type ${it.getString("type")}")
                    },
                )
            }
            val materials = j.optJSONArray("materials").objects().map { m ->
                val pbr = m.optJSONObject("pbrMetallicRoughness")
                val base = pbr?.optJSONArray("baseColorFactor").floats(floatArrayOf(1f, 1f, 1f, 1f))
                val strength = m.optJSONObject("extensions")
                    ?.optJSONObject("KHR_materials_emissive_strength")
                    ?.optDouble("emissiveStrength", 1.0)?.toFloat() ?: 1f
                val emissive = m.optJSONArray("emissiveFactor").floats(floatArrayOf(0f, 0f, 0f))
                    .map { it * strength }.toFloatArray()
                Material(base, emissive, pbr?.optDouble("roughnessFactor", 1.0)?.toFloat() ?: 1f)
            }
            val meshes = j.optJSONArray("meshes").objects().map { mesh ->
                mesh.getJSONArray("primitives").objects().mapNotNull { pr ->
                    val attrs = pr.getJSONObject("attributes")
                    if (!attrs.has("POSITION") || !attrs.has("NORMAL") || !pr.has("indices")) return@mapNotNull null
                    Primitive(
                        position = attrs.getInt("POSITION"),
                        normal = attrs.getInt("NORMAL"),
                        indices = pr.getInt("indices"),
                        material = pr.optInt("material", -1),
                        mode = pr.optInt("mode", 4),
                    )
                }
            }
            val nodes = j.optJSONArray("nodes").objects().map {
                Node(
                    name = it.optString("name", ""),
                    mesh = it.optInt("mesh", -1),
                    children = it.optJSONArray("children").ints(),
                    translation = it.optJSONArray("translation").floats(floatArrayOf(0f, 0f, 0f)),
                    rotation = it.optJSONArray("rotation").floats(floatArrayOf(0f, 0f, 0f, 1f)),
                    scale = it.optJSONArray("scale").floats(floatArrayOf(1f, 1f, 1f)),
                    matrix = it.optJSONArray("matrix")?.let { m -> m.floats(FloatArray(16)) },
                )
            }
            val scenes = j.optJSONArray("scenes").objects()
            val scene = scenes.getOrNull(j.optInt("scene", 0))
            val roots = scene?.optJSONArray("nodes").ints().takeIf { it.isNotEmpty() }
                ?: run {
                    // Scene заагаагүй бол эцэггүй бүх зангилаа
                    val child = nodes.flatMap { n -> n.children.toList() }.toSet()
                    nodes.indices.filter { it !in child }.toIntArray()
                }
            return Gltf(nodes, roots, meshes, materials, accessors, bufferViews, bin)
        }

        private fun JSONArray?.objects(): List<JSONObject> =
            if (this == null) emptyList() else List(length()) { getJSONObject(it) }

        private fun JSONArray?.ints(): IntArray =
            if (this == null) IntArray(0) else IntArray(length()) { getInt(it) }

        private fun JSONArray?.strings(): Set<String> =
            if (this == null) emptySet() else List(length()) { getString(it) }.toSet()

        private fun JSONArray?.floats(default: FloatArray): FloatArray =
            if (this == null || length() != default.size) default else FloatArray(length()) { getDouble(it).toFloat() }
    }
}
