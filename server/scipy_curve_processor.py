"""
SciPy Curve Processor
Advanced curve fitting, interpolation, and geometric calculations using SciPy.
Enhances CAD entity processing with scientific computing capabilities.
"""

import sys
from pathlib import Path
from typing import List, Tuple, Optional, Callable, Dict, Any
from dataclasses import dataclass
import numpy as np

try:
    from scipy import interpolate, optimize, signal, spatial, ndimage
    from scipy.spatial.distance import cdist
except ImportError:
    print("SciPy not installed. Run: pip install scipy")
    sys.exit(1)

sys.path.insert(0, str(Path(__file__).parent))


@dataclass
class CurveAnalysis:
    """Analysis results for a curve"""
    length: float
    curvature_max: float
    curvature_mean: float
    inflection_points: List[Tuple[float, float]]
    smoothness: float


class SciPyCurveProcessor:
    """
    Advanced curve processing using SciPy.
    Provides interpolation, fitting, and geometric analysis.
    """

    def __init__(self):
        self.curves: Dict[str, np.ndarray] = {}
        self.interpolators: Dict[str, Any] = {}

    def fit_bspline(
        self,
        points: np.ndarray,
        degree: int = 3,
        smoothing: Optional[float] = None,
        num_samples: int = 100
    ) -> Tuple[np.ndarray, Any]:
        """
        Fit a B-spline to points.
        Returns sampled curve points and the interpolator.
        """
        if len(points) < degree + 1:
            degree = max(1, len(points) - 1)

        # Separate x and y coordinates
        x = points[:, 0]
        y = points[:, 1]

        # Parameterize by cumulative chord length
        distances = np.sqrt(np.sum(np.diff(points, axis=0)**2, axis=1))
        t = np.concatenate([[0], np.cumsum(distances)])
        t = t / t[-1]  # Normalize to [0, 1]

        # Fit splines
        if smoothing is None:
            tck_x, _ = interpolate.splprep([x, y], s=0, k=degree)
            tck = tck_x
        else:
            tck, _ = interpolate.splprep([x, y], s=smoothing, k=degree)

        # Sample the curve
        u_new = np.linspace(0, 1, num_samples)
        fitted_points = interpolate.splev(u_new, tck)
        result = np.column_stack(fitted_points)

        return result, tck

    def interpolate_curve(
        self,
        points: np.ndarray,
        method: str = 'cubic',
        num_samples: int = 100
    ) -> np.ndarray:
        """
        Interpolate curve through points.
        Methods: 'linear', 'cubic', 'quadratic', 'akima', 'pchip'
        """
        x = points[:, 0]
        y = points[:, 1]

        if method == 'akima':
            interpolator = interpolate.Akima1DInterpolator(x, y)
        elif method == 'pchip':
            interpolator = interpolate.PchipInterpolator(x, y)
        elif method in ['linear', 'quadratic', 'cubic']:
            interpolator = interpolate.interp1d(x, y, kind=method)
        else:
            raise ValueError(f"Unknown interpolation method: {method}")

        x_new = np.linspace(x.min(), x.max(), num_samples)
        y_new = interpolator(x_new)

        return np.column_stack([x_new, y_new])

    def smooth_curve(
        self,
        points: np.ndarray,
        window_length: int = 5,
        polyorder: int = 3
    ) -> np.ndarray:
        """
        Smooth curve using Savitzky-Golay filter.
        Preserves features better than simple averaging.
        """
        if len(points) <= window_length:
            window_length = len(points) - 1
            if window_length % 2 == 0:
                window_length -= 1
            window_length = max(3, window_length)

        if polyorder >= window_length:
            polyorder = window_length - 1

        x_smooth = signal.savgol_filter(points[:, 0], window_length, polyorder)
        y_smooth = signal.savgol_filter(points[:, 1], window_length, polyorder)

        return np.column_stack([x_smooth, y_smooth])

    def resample_curve(
        self,
        points: np.ndarray,
        num_points: int,
        method: str = 'uniform'
    ) -> np.ndarray:
        """
        Resample curve to specified number of points.
        Methods: 'uniform' (by arc length) or 'parameter' (by parameter)
        """
        if method == 'uniform':
            # Resample by arc length
            distances = np.sqrt(np.sum(np.diff(points, axis=0)**2, axis=1))
            cumulative = np.concatenate([[0], np.cumsum(distances)])

            # Interpolate
            f_x = interpolate.interp1d(cumulative, points[:, 0])
            f_y = interpolate.interp1d(cumulative, points[:, 1])

            new_s = np.linspace(0, cumulative[-1], num_points)
            new_x = f_x(new_s)
            new_y = f_y(new_s)

            return np.column_stack([new_x, new_y])
        else:
            # Simple parameter-based resampling
            indices = np.linspace(0, len(points) - 1, num_points)
            f_x = interpolate.interp1d(np.arange(len(points)), points[:, 0])
            f_y = interpolate.interp1d(np.arange(len(points)), points[:, 1])

            new_x = f_x(indices)
            new_y = f_y(indices)

            return np.column_stack([new_x, new_y])

    def compute_curvature(self, points: np.ndarray) -> np.ndarray:
        """
        Compute curvature at each point using finite differences.
        """
        # First and second derivatives
        dx = np.gradient(points[:, 0])
        dy = np.gradient(points[:, 1])
        ddx = np.gradient(dx)
        ddy = np.gradient(dy)

        # Curvature formula: κ = |x'y'' - y'x''| / (x'^2 + y'^2)^(3/2)
        numerator = np.abs(dx * ddy - dy * ddx)
        denominator = (dx**2 + dy**2)**(3/2)

        # Avoid division by zero
        denominator[denominator < 1e-10] = 1e-10

        curvature = numerator / denominator

        return curvature

    def find_inflection_points(self, points: np.ndarray) -> List[Tuple[float, float]]:
        """
        Find inflection points where curvature changes sign.
        """
        curvature = self.compute_curvature(points)

        # Find sign changes
        sign_changes = np.where(np.diff(np.sign(curvature)))[0]

        inflections = []
        for idx in sign_changes:
            if 0 < idx < len(points) - 1:
                inflections.append((points[idx, 0], points[idx, 1]))

        return inflections

    def compute_arc_length(self, points: np.ndarray) -> float:
        """
        Compute total arc length of curve.
        """
        distances = np.sqrt(np.sum(np.diff(points, axis=0)**2, axis=1))
        return float(np.sum(distances))

    def analyze_curve(self, points: np.ndarray) -> CurveAnalysis:
        """
        Comprehensive curve analysis.
        """
        curvature = self.compute_curvature(points)
        inflections = self.find_inflection_points(points)
        length = self.compute_arc_length(points)

        # Smoothness: inverse of curvature variance
        smoothness = 1.0 / (1.0 + np.var(curvature))

        return CurveAnalysis(
            length=length,
            curvature_max=float(np.max(curvature)),
            curvature_mean=float(np.mean(curvature)),
            inflection_points=inflections,
            smoothness=float(smoothness)
        )

    def fit_circle(self, points: np.ndarray) -> Tuple[np.ndarray, float]:
        """
        Fit a circle to points using least squares.
        Returns (center, radius).
        """
        def calc_R(xc, yc):
            return np.sqrt((points[:, 0] - xc)**2 + (points[:, 1] - yc)**2)

        def objective(c):
            Ri = calc_R(*c)
            return Ri - Ri.mean()

        # Initial guess: centroid
        center_estimate = points.mean(axis=0)

        # Optimize
        result = optimize.least_squares(objective, center_estimate)
        xc, yc = result.x

        # Calculate radius
        Ri = calc_R(xc, yc)
        radius = Ri.mean()

        return np.array([xc, yc]), radius

    def fit_ellipse(self, points: np.ndarray) -> Dict[str, float]:
        """
        Fit an ellipse to points.
        Returns dictionary with center, semi-axes, and rotation.
        """
        x = points[:, 0]
        y = points[:, 1]

        # Normalize
        x_mean = x.mean()
        y_mean = y.mean()
        x_norm = x - x_mean
        y_norm = y - y_mean

        # Build design matrix
        D = np.column_stack([x_norm**2, x_norm*y_norm, y_norm**2, x_norm, y_norm, np.ones_like(x_norm)])

        # Solve
        S = D.T @ D
        C = np.zeros((6, 6))
        C[0, 2] = 2
        C[1, 1] = -1
        C[2, 0] = 2

        # Eigenvalue problem
        vals, vecs = np.linalg.eig(np.linalg.inv(S) @ C)

        # Find positive eigenvalue
        valid = vals > 0
        if not np.any(valid):
            # Fallback: return circle approximation
            _, radius = self.fit_circle(points)
            return {
                'center_x': x_mean,
                'center_y': y_mean,
                'semi_major': radius,
                'semi_minor': radius,
                'rotation': 0.0
            }

        a = vecs[:, valid][:, 0]

        # Extract parameters
        A, B, C, D, E, F = a

        # Calculate center
        x0 = (B*E - 2*C*D) / (4*A*C - B**2)
        y0 = (B*D - 2*A*E) / (4*A*C - B**2)

        # Calculate semi-axes
        num = 2 * (A*E**2 + C*D**2 + F*B**2 - B*D*E - A*C*F)
        den1 = (B**2 - A*C) * (np.sqrt((A-C)**2 + B**2) - (A+C))
        den2 = (B**2 - A*C) * (-np.sqrt((A-C)**2 + B**2) - (A+C))

        a_axis = np.sqrt(abs(num / den1))
        b_axis = np.sqrt(abs(num / den2))

        # Rotation angle
        if B == 0:
            if A < C:
                rotation = 0
            else:
                rotation = np.pi / 2
        else:
            rotation = np.arctan2(C - A - np.sqrt((A-C)**2 + B**2), B)

        return {
            'center_x': float(x0 + x_mean),
            'center_y': float(y0 + y_mean),
            'semi_major': float(max(a_axis, b_axis)),
            'semi_minor': float(min(a_axis, b_axis)),
            'rotation': float(np.degrees(rotation))
        }

    def compute_convex_hull(self, points: np.ndarray) -> np.ndarray:
        """
        Compute 2D convex hull of points.
        """
        hull = spatial.ConvexHull(points)
        return points[hull.vertices]

    def compute_closest_points(
        self,
        curve1: np.ndarray,
        curve2: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray, float]:
        """
        Find closest points between two curves.
        Returns (point on curve1, point on curve2, distance).
        """
        distances = cdist(curve1, curve2)
        min_idx = np.unravel_index(np.argmin(distances), distances.shape)

        point1 = curve1[min_idx[0]]
        point2 = curve2[min_idx[1]]
        distance = distances[min_idx]

        return point1, point2, float(distance)

    def offset_curve(
        self,
        points: np.ndarray,
        offset_distance: float,
        num_samples: int = 100
    ) -> np.ndarray:
        """
        Create an offset curve (parallel curve).
        """
        # Fit smooth spline
        fitted, tck = self.fit_bspline(points, num_samples=num_samples)

        # Compute normals
        dx = np.gradient(fitted[:, 0])
        dy = np.gradient(fitted[:, 1])

        # Perpendicular vectors (rotated 90 degrees)
        normals = np.column_stack([-dy, dx])

        # Normalize
        norm_lengths = np.sqrt(normals[:, 0]**2 + normals[:, 1]**2)
        normals = normals / norm_lengths[:, np.newaxis]

        # Offset
        offset_curve = fitted + normals * offset_distance

        return offset_curve

    def simplify_curve(
        self,
        points: np.ndarray,
        tolerance: float = 1.0
    ) -> np.ndarray:
        """
        Simplify curve using Ramer-Douglas-Peucker algorithm.
        """
        def perpendicular_distance(point, line_start, line_end):
            if np.allclose(line_start, line_end):
                return np.linalg.norm(point - line_start)

            line_vec = line_end - line_start
            point_vec = point - line_start
            line_len = np.linalg.norm(line_vec)
            line_unitvec = line_vec / line_len

            projection = np.dot(point_vec, line_unitvec)
            projection = np.clip(projection, 0, line_len)

            nearest = line_start + line_unitvec * projection
            return np.linalg.norm(point - nearest)

        def rdp(points, tolerance):
            if len(points) < 3:
                return points

            # Find point with maximum distance
            dmax = 0
            index = 0
            for i in range(1, len(points) - 1):
                d = perpendicular_distance(points[i], points[0], points[-1])
                if d > dmax:
                    index = i
                    dmax = d

            # If max distance is greater than tolerance, recursively simplify
            if dmax > tolerance:
                results1 = rdp(points[:index+1], tolerance)
                results2 = rdp(points[index:], tolerance)

                return np.vstack([results1[:-1], results2])
            else:
                return np.array([points[0], points[-1]])

        return rdp(points, tolerance)


def main():
    """
    Demo of SciPy curve processing capabilities.
    """
    print("=" * 60)
    print("SciPy Curve Processor Demo")
    print("=" * 60)

    processor = SciPyCurveProcessor()

    # Create test points (noisy circle)
    t = np.linspace(0, 2*np.pi, 50)
    noise = np.random.normal(0, 0.5, 50)
    x = 10 * np.cos(t) + noise
    y = 10 * np.sin(t) + noise
    points = np.column_stack([x, y])

    print("\nOriginal points: 50 noisy samples")

    # Fit circle
    center, radius = processor.fit_circle(points)
    print(f"\nCircle fit:")
    print(f"  Center: ({center[0]:.2f}, {center[1]:.2f})")
    print(f"  Radius: {radius:.2f}")

    # Smooth curve
    smoothed = processor.smooth_curve(points, window_length=7, polyorder=3)
    print(f"\nSmoothed curve: {len(smoothed)} points")

    # Fit B-spline
    fitted, _ = processor.fit_bspline(points, degree=3, num_samples=100)
    print(f"B-spline fit: {len(fitted)} points")

    # Analyze curve
    analysis = processor.analyze_curve(fitted)
    print(f"\nCurve analysis:")
    print(f"  Arc length: {analysis.length:.2f}")
    print(f"  Max curvature: {analysis.curvature_max:.4f}")
    print(f"  Mean curvature: {analysis.curvature_mean:.4f}")
    print(f"  Smoothness: {analysis.smoothness:.4f}")

    # Create offset curve
    offset = processor.offset_curve(points, offset_distance=2.0, num_samples=100)
    print(f"\nOffset curve: {len(offset)} points (offset = 2.0)")

    print("\n" + "=" * 60)
    print("Demo Complete!")
    print("=" * 60)


if __name__ == '__main__':
    main()
