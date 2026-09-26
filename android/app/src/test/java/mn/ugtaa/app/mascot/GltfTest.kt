package mn.ugtaa.app.mascot

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/** Апп-д орох taa.glb-ийг (design/build_assets.py) уншигч зөв тайлж байгааг шалгана. */
class GltfTest {

    private val gltf = Gltf.parse(File("src/main/assets/models/taa.glb").readBytes())

    @Test
    fun animatedNodesExist() {
        val names = listOf(
            "Taa", "Body", "Face", "Eye_L", "Eye_R", "Pupil_L", "Pupil_R",
            "Arm_L", "Arm_R", "Hat", "Tile_1", "Tile_2", "Tile_3",
        )
        for (n in names) assertTrue("зангилаа алга: $n", gltf.nodeIndex(n) >= 0)
    }

    @Test
    fun everyPrimitiveIsIndexedTriangles() {
        var prims = 0
        for (mesh in gltf.meshes) for (p in mesh) {
            prims++
            assertEquals(4, p.mode)
            assertEquals(3, gltf.accessors[p.position].components)
            assertEquals(3, gltf.accessors[p.normal].components)
            assertEquals(0, gltf.accessors[p.indices].count % 3)
            assertTrue(p.material >= 0)
        }
        assertTrue("меш хэт цөөн: $prims", prims >= 40)
    }

    @Test
    fun quantizedNormalsDecodeToUnitLength() {
        val v = FloatArray(3)
        for (mesh in gltf.meshes) for (p in mesh) {
            val a = gltf.accessors[p.normal]
            for (i in 0 until a.count step 7) {
                gltf.readVec(p.normal, i, v)
                val len = sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
                assertTrue("нормалийн урт $len", len in 0.9f..1.1f)
            }
        }
    }

    /** Blender-ийн хэмжээс: өндөр ≈ 2.5 (хөлнөөс сампин хүртэл), өргөн ≈ 3.3 (хавтангуудтай). */
    @Test
    fun worldBoundsMatchBlenderScene() {
        val world = Array(gltf.nodes.size) { FloatArray(16) }
        val local = FloatArray(16)
        fun walk(i: Int, parent: FloatArray) {
            val n = gltf.nodes[i]
            if (n.matrix != null) System.arraycopy(n.matrix, 0, local, 0, 16)
            else Transform.compose(n.translation, n.rotation, n.scale, local)
            Transform.mul(parent, local, world[i])
            for (c in n.children) walk(c, world[i])
        }
        val identity = FloatArray(16).also { it[0] = 1f; it[5] = 1f; it[10] = 1f; it[15] = 1f }
        for (r in gltf.roots) walk(r, identity)

        val lo = FloatArray(3) { Float.MAX_VALUE }
        val hi = FloatArray(3) { -Float.MAX_VALUE }
        val v = FloatArray(3)
        val w = FloatArray(3)
        gltf.nodes.forEachIndexed { i, n ->
            if (n.mesh < 0) return@forEachIndexed
            for (p in gltf.meshes[n.mesh]) for (k in 0 until gltf.accessors[p.position].count) {
                gltf.readVec(p.position, k, v)
                Transform.transformPoint(world[i], v, w)
                for (c in 0..2) { lo[c] = min(lo[c], w[c]); hi[c] = max(hi[c], w[c]) }
            }
        }
        val height = hi[1] - lo[1]
        val width = hi[0] - lo[0]
        assertTrue("өндөр $height", height in 2.2f..2.8f)
        assertTrue("өргөн $width", width in 2.8f..3.7f)
        assertTrue("хөл газар дээр биш: ${lo[1]}", lo[1] in -0.1f..0.1f)
    }

    @Test
    fun normalMatrixOfRotationIsItself() {
        val m = FloatArray(16)
        val q = FloatArray(4)
        Transform.axisAngle(0f, 0f, 1f, 0.7f, q)
        Transform.compose(floatArrayOf(1f, 2f, 3f), q, floatArrayOf(1f, 1f, 1f), m)
        val n = FloatArray(9)
        Transform.normalMatrix(m, n)
        val expected = floatArrayOf(m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10])
        for (i in 0 until 9) assertEquals(expected[i], n[i], 1e-5f)
    }
}
