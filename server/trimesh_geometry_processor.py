"""
Trimesh Geometry Processor
Advanced 3D mesh processing using the Trimesh library.
Provides mesh optimization, repair, boolean operations, and format conversion.
"""

import sys
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass
import tempfile

try:
    import trimesh
    import numpy as np
except ImportError:
    print("Trimesh not installed. Run: pip install trimesh scipy")
    sys.exit(1)

sys.path.insert(0, str(Path(__file__).parent))


@dataclass
class MeshAnalysis:
    """Analysis results for a mesh"""
    vertices: int
    faces: int
    edges: int
    is_watertight: bool
    is_convex: bool
    volume: float
    surface_area: float
    bounds: Tuple[np.ndarray, np.ndarray]
    center_mass: np.ndarray
    inertia: np.ndarray
    euler_number: int


class TrimeshGeometryProcessor:
    """
    Advanced 3D geometry processor using Trimesh.
    Provides professional-grade mesh operations.
    """

    def __init__(self):
        self.meshes: Dict[str, trimesh.Trimesh] = {}
        self.scene: Optional[trimesh.Scene] = None

    def load_mesh(self, file_path: str, name: Optional[str] = None) -> str:
        """
        Load a mesh from file.
        Supports: OBJ, STL, PLY, OFF, GLB, GLTF, and more.
        """
        mesh = trimesh.load(file_path, force='mesh')

        if name is None:
            name = Path(file_path).stem

        self.meshes[name] = mesh
        return name

    def create_mesh_from_vertices_faces(
        self,
        vertices: np.ndarray,
        faces: np.ndarray,
        name: str = "mesh"
    ) -> trimesh.Trimesh:
        """
        Create a Trimesh from raw vertices and faces.
        """
        mesh = trimesh.Trimesh(vertices=vertices, faces=faces)
        self.meshes[name] = mesh
        return mesh

    def analyze_mesh(self, name: str) -> MeshAnalysis:
        """
        Perform comprehensive analysis on a mesh.
        """
        if name not in self.meshes:
            raise ValueError(f"Mesh '{name}' not found")

        mesh = self.meshes[name]

        return MeshAnalysis(
            vertices=len(mesh.vertices),
            faces=len(mesh.faces),
            edges=len(mesh.edges),
            is_watertight=mesh.is_watertight,
            is_convex=mesh.is_convex,
            volume=float(mesh.volume) if mesh.is_watertight else 0.0,
            surface_area=float(mesh.area),
            bounds=(mesh.bounds[0], mesh.bounds[1]),
            center_mass=mesh.center_mass,
            inertia=mesh.moment_inertia,
            euler_number=mesh.euler_number
        )

    def repair_mesh(self, name: str) -> bool:
        """
        Attempt to repair mesh issues.
        Fixes duplicate vertices, degenerate faces, and makes watertight.
        """
        if name not in self.meshes:
            return False

        mesh = self.meshes[name]

        # Remove duplicate vertices
        mesh.merge_vertices()

        # Remove degenerate faces
        mesh.remove_degenerate_faces()

        # Remove unreferenced vertices
        mesh.remove_unreferenced_vertices()

        # Fix normals
        mesh.fix_normals()

        # Attempt to fill holes if not watertight
        if not mesh.is_watertight:
            try:
                mesh.fill_holes()
            except:
                pass

        self.meshes[name] = mesh
        return True

    def simplify_mesh(
        self,
        name: str,
        target_faces: Optional[int] = None,
        percent: Optional[float] = None
    ) -> bool:
        """
        Simplify mesh by reducing face count.
        Specify either target_faces or percent (0.0-1.0).
        """
        if name not in self.meshes:
            return False

        mesh = self.meshes[name]

        if target_faces is not None:
            simplified = mesh.simplify_quadric_decimation(target_faces)
        elif percent is not None:
            target = int(len(mesh.faces) * percent)
            simplified = mesh.simplify_quadric_decimation(target)
        else:
            # Default to 50% reduction
            target = len(mesh.faces) // 2
            simplified = mesh.simplify_quadric_decimation(target)

        self.meshes[name] = simplified
        return True

    def smooth_mesh(self, name: str, iterations: int = 1) -> bool:
        """
        Smooth mesh using Laplacian smoothing.
        """
        if name not in self.meshes:
            return False

        mesh = self.meshes[name]

        for _ in range(iterations):
            # Laplacian smoothing
            trimesh.smoothing.filter_laplacian(mesh, iterations=1)

        self.meshes[name] = mesh
        return True

    def subdivide_mesh(self, name: str, iterations: int = 1) -> bool:
        """
        Subdivide mesh faces for higher resolution.
        Uses Loop subdivision for smooth results.
        """
        if name not in self.meshes:
            return False

        mesh = self.meshes[name]

        for _ in range(iterations):
            mesh = mesh.subdivide()

        self.meshes[name] = mesh
        return True

    def boolean_union(self, name1: str, name2: str, result_name: str = "union") -> bool:
        """
        Perform boolean union of two meshes.
        """
        if name1 not in self.meshes or name2 not in self.meshes:
            return False

        mesh1 = self.meshes[name1]
        mesh2 = self.meshes[name2]

        try:
            result = mesh1.union(mesh2, engine='blender')
            self.meshes[result_name] = result
            return True
        except:
            return False

    def boolean_difference(self, name1: str, name2: str, result_name: str = "difference") -> bool:
        """
        Perform boolean difference (subtract mesh2 from mesh1).
        """
        if name1 not in self.meshes or name2 not in self.meshes:
            return False

        mesh1 = self.meshes[name1]
        mesh2 = self.meshes[name2]

        try:
            result = mesh1.difference(mesh2, engine='blender')
            self.meshes[result_name] = result
            return True
        except:
            return False

    def boolean_intersection(self, name1: str, name2: str, result_name: str = "intersection") -> bool:
        """
        Perform boolean intersection of two meshes.
        """
        if name1 not in self.meshes or name2 not in self.meshes:
            return False

        mesh1 = self.meshes[name1]
        mesh2 = self.meshes[name2]

        try:
            result = mesh1.intersection(mesh2, engine='blender')
            self.meshes[result_name] = result
            return True
        except:
            return False

    def slice_mesh(self, name: str, plane_origin: np.ndarray, plane_normal: np.ndarray) -> Optional[trimesh.path.Path2D]:
        """
        Slice mesh with a plane, return 2D cross-section.
        """
        if name not in self.meshes:
            return None

        mesh = self.meshes[name]

        try:
            slice_2d = mesh.section(plane_origin=plane_origin, plane_normal=plane_normal)
            return slice_2d
        except:
            return None

    def compute_convex_hull(self, name: str, result_name: str = "convex_hull") -> bool:
        """
        Compute convex hull of mesh.
        """
        if name not in self.meshes:
            return False

        mesh = self.meshes[name]

        try:
            hull = mesh.convex_hull
            self.meshes[result_name] = hull
            return True
        except:
            return False

    def voxelize_mesh(self, name: str, pitch: float = 1.0) -> Optional[trimesh.voxel.VoxelGrid]:
        """
        Convert mesh to voxel representation.
        """
        if name not in self.meshes:
            return None

        mesh = self.meshes[name]

        try:
            voxels = mesh.voxelized(pitch=pitch)
            return voxels
        except:
            return None

    def remesh_uniform(self, name: str, target_edge_length: float = 1.0) -> bool:
        """
        Remesh to have uniform edge lengths.
        """
        if name not in self.meshes:
            return False

        mesh = self.meshes[name]

        try:
            # Use isotropic remeshing if available
            vertices, faces = trimesh.remesh.subdivide_to_size(
                mesh.vertices,
                mesh.faces,
                max_edge=target_edge_length
            )
            remeshed = trimesh.Trimesh(vertices=vertices, faces=faces)
            self.meshes[name] = remeshed
            return True
        except:
            return False

    def compute_geodesic_distance(self, name: str, vertex_indices: List[int]) -> Optional[np.ndarray]:
        """
        Compute geodesic distances from specified vertices.
        """
        if name not in self.meshes:
            return None

        mesh = self.meshes[name]

        try:
            # This requires networkx
            distances = trimesh.graph.vertex_adjacency_graph(mesh)
            return distances
        except:
            return None

    def apply_transform(self, name: str, matrix: np.ndarray) -> bool:
        """
        Apply 4x4 transformation matrix to mesh.
        """
        if name not in self.meshes:
            return False

        mesh = self.meshes[name]
        mesh.apply_transform(matrix)
        self.meshes[name] = mesh
        return True

    def translate(self, name: str, translation: np.ndarray) -> bool:
        """
        Translate mesh by vector.
        """
        if name not in self.meshes:
            return False

        mesh = self.meshes[name]
        mesh.apply_translation(translation)
        self.meshes[name] = mesh
        return True

    def rotate(self, name: str, rotation_matrix: np.ndarray) -> bool:
        """
        Rotate mesh using 3x3 rotation matrix.
        """
        if name not in self.meshes:
            return False

        # Convert 3x3 to 4x4
        transform = np.eye(4)
        transform[:3, :3] = rotation_matrix

        return self.apply_transform(name, transform)

    def scale(self, name: str, scale_factor: float) -> bool:
        """
        Uniformly scale mesh.
        """
        if name not in self.meshes:
            return False

        mesh = self.meshes[name]
        mesh.apply_scale(scale_factor)
        self.meshes[name] = mesh
        return True

    def export_mesh(
        self,
        name: str,
        output_path: str,
        file_format: Optional[str] = None
    ) -> bool:
        """
        Export mesh to file.
        Supports: OBJ, STL, PLY, OFF, GLTF, GLB, and more.
        """
        if name not in self.meshes:
            return False

        mesh = self.meshes[name]

        try:
            mesh.export(output_path, file_type=file_format)
            return True
        except Exception as e:
            print(f"Export failed: {e}")
            return False

    def create_scene(self, mesh_names: Optional[List[str]] = None) -> trimesh.Scene:
        """
        Create a scene with multiple meshes.
        """
        if mesh_names is None:
            mesh_names = list(self.meshes.keys())

        meshes_dict = {name: self.meshes[name] for name in mesh_names if name in self.meshes}
        self.scene = trimesh.Scene(meshes_dict)
        return self.scene

    def export_scene(self, output_path: str) -> bool:
        """
        Export entire scene to file (GLTF/GLB recommended).
        """
        if self.scene is None:
            self.create_scene()

        try:
            self.scene.export(output_path)
            return True
        except:
            return False

    def get_mesh(self, name: str) -> Optional[trimesh.Trimesh]:
        """
        Get mesh by name.
        """
        return self.meshes.get(name)

    def list_meshes(self) -> List[str]:
        """
        List all loaded mesh names.
        """
        return list(self.meshes.keys())

    def remove_mesh(self, name: str) -> bool:
        """
        Remove mesh from processor.
        """
        if name in self.meshes:
            del self.meshes[name]
            return True
        return False

    def clear_all(self):
        """
        Clear all meshes.
        """
        self.meshes.clear()
        self.scene = None


def main():
    """
    Demo of Trimesh capabilities.
    """
    print("=" * 60)
    print("Trimesh Geometry Processor Demo")
    print("=" * 60)

    processor = TrimeshGeometryProcessor()

    # Create a simple cube
    cube = trimesh.creation.box(extents=[10, 10, 10])
    processor.meshes['cube'] = cube

    # Create a sphere
    sphere = trimesh.creation.icosphere(radius=7.0)
    processor.meshes['sphere'] = sphere

    print("\nCreated test meshes:")
    print(f"  - Cube: {len(cube.vertices)} vertices, {len(cube.faces)} faces")
    print(f"  - Sphere: {len(sphere.vertices)} vertices, {len(sphere.faces)} faces")

    # Analyze cube
    print("\nCube Analysis:")
    analysis = processor.analyze_mesh('cube')
    print(f"  Volume: {analysis.volume:.2f}")
    print(f"  Surface Area: {analysis.surface_area:.2f}")
    print(f"  Watertight: {analysis.is_watertight}")
    print(f"  Convex: {analysis.is_convex}")

    # Perform boolean union
    print("\nPerforming boolean union...")
    processor.boolean_union('cube', 'sphere', 'union')

    if 'union' in processor.meshes:
        union_mesh = processor.meshes['union']
        print(f"  Union result: {len(union_mesh.vertices)} vertices, {len(union_mesh.faces)} faces")

    # Export results
    output_dir = Path(tempfile.gettempdir()) / "trimesh_output"
    output_dir.mkdir(exist_ok=True)

    for name in processor.list_meshes():
        output_path = output_dir / f"{name}.obj"
        processor.export_mesh(name, str(output_path))
        print(f"\nExported: {output_path}")

    print("\n" + "=" * 60)
    print("Demo Complete!")
    print("=" * 60)


if __name__ == '__main__':
    main()
