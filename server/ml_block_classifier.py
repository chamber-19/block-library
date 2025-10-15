"""
ML Block Classifier
Machine learning-powered block classification, similarity detection, and clustering.
Uses scikit-learn for intelligent CAD block organization.
"""

import sys
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass
import json
import pickle
import numpy as np

try:
    from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
    from sklearn.decomposition import PCA
    from sklearn.manifold import TSNE
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import silhouette_score
    from sklearn.neighbors import NearestNeighbors
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
except ImportError:
    print("Scikit-learn not installed. Run: pip install scikit-learn")
    sys.exit(1)

sys.path.insert(0, str(Path(__file__).parent))


@dataclass
class BlockFeatures:
    """Feature vector for a CAD block"""
    name: str
    num_entities: int
    num_vertices: int
    bounding_box_area: float
    bounding_box_aspect_ratio: float
    complexity_score: float
    entity_type_distribution: Dict[str, int]
    centroid: Tuple[float, float]
    layer_count: int
    color_count: int


@dataclass
class ClusterResult:
    """Result of clustering operation"""
    cluster_labels: np.ndarray
    cluster_centers: Optional[np.ndarray]
    num_clusters: int
    silhouette_score: float


@dataclass
class SimilarityResult:
    """Result of similarity search"""
    block_name: str
    similarity_score: float
    distance: float


class MLBlockClassifier:
    """
    Machine learning classifier for CAD blocks.
    Provides clustering, classification, and similarity detection.
    """

    def __init__(self):
        self.features: Dict[str, BlockFeatures] = {}
        self.feature_matrix: Optional[np.ndarray] = None
        self.feature_names: List[str] = []
        self.scaler = StandardScaler()
        self.block_names: List[str] = []

        # Models
        self.kmeans_model: Optional[KMeans] = None
        self.pca_model: Optional[PCA] = None
        self.nn_model: Optional[NearestNeighbors] = None

    def add_block_features(self, features: BlockFeatures):
        """
        Add features for a block.
        """
        self.features[features.name] = features

    def extract_features_from_dict(self, block_data: Dict[str, Any]) -> BlockFeatures:
        """
        Extract features from block dictionary.
        """
        # Calculate bounding box metrics
        entities = block_data.get('entities', [])
        all_points = []

        entity_types = {}
        layers = set()
        colors = set()

        for entity in entities:
            entity_type = entity.get('type', 'unknown')
            entity_types[entity_type] = entity_types.get(entity_type, 0) + 1

            if 'layer' in entity:
                layers.add(entity['layer'])
            if 'color' in entity:
                colors.add(entity['color'])

            points = entity.get('points', [])
            for point in points:
                if isinstance(point, (list, tuple)) and len(point) >= 2:
                    all_points.append(point[:2])

        # Bounding box
        if all_points:
            all_points = np.array(all_points)
            min_pt = all_points.min(axis=0)
            max_pt = all_points.max(axis=0)
            width = max_pt[0] - min_pt[0]
            height = max_pt[1] - min_pt[1]
            area = width * height
            aspect_ratio = width / height if height > 0 else 1.0
            centroid = ((min_pt[0] + max_pt[0]) / 2, (min_pt[1] + max_pt[1]) / 2)
        else:
            area = 0.0
            aspect_ratio = 1.0
            centroid = (0.0, 0.0)

        # Complexity score (weighted sum of entities and vertices)
        num_entities = len(entities)
        num_vertices = len(all_points)
        complexity = num_entities * 1.0 + num_vertices * 0.1

        return BlockFeatures(
            name=block_data.get('name', 'unknown'),
            num_entities=num_entities,
            num_vertices=num_vertices,
            bounding_box_area=area,
            bounding_box_aspect_ratio=aspect_ratio,
            complexity_score=complexity,
            entity_type_distribution=entity_types,
            centroid=centroid,
            layer_count=len(layers),
            color_count=len(colors)
        )

    def build_feature_matrix(self):
        """
        Build feature matrix from collected features.
        """
        if not self.features:
            raise ValueError("No features available")

        self.block_names = list(self.features.keys())
        rows = []

        for name in self.block_names:
            feat = self.features[name]

            # Numerical features
            row = [
                feat.num_entities,
                feat.num_vertices,
                feat.bounding_box_area,
                feat.bounding_box_aspect_ratio,
                feat.complexity_score,
                feat.centroid[0],
                feat.centroid[1],
                feat.layer_count,
                feat.color_count
            ]

            rows.append(row)

        self.feature_matrix = np.array(rows)
        self.feature_names = [
            'num_entities', 'num_vertices', 'bounding_box_area',
            'bounding_box_aspect_ratio', 'complexity_score',
            'centroid_x', 'centroid_y', 'layer_count', 'color_count'
        ]

        # Normalize features
        self.feature_matrix = self.scaler.fit_transform(self.feature_matrix)

    def cluster_kmeans(
        self,
        n_clusters: int = 5,
        random_state: int = 42
    ) -> ClusterResult:
        """
        Cluster blocks using K-Means.
        """
        if self.feature_matrix is None:
            self.build_feature_matrix()

        self.kmeans_model = KMeans(n_clusters=n_clusters, random_state=random_state, n_init=10)
        labels = self.kmeans_model.fit_predict(self.feature_matrix)

        # Compute silhouette score
        if len(set(labels)) > 1:
            score = silhouette_score(self.feature_matrix, labels)
        else:
            score = 0.0

        return ClusterResult(
            cluster_labels=labels,
            cluster_centers=self.kmeans_model.cluster_centers_,
            num_clusters=n_clusters,
            silhouette_score=score
        )

    def cluster_dbscan(
        self,
        eps: float = 0.5,
        min_samples: int = 5
    ) -> ClusterResult:
        """
        Cluster blocks using DBSCAN (density-based).
        """
        if self.feature_matrix is None:
            self.build_feature_matrix()

        dbscan = DBSCAN(eps=eps, min_samples=min_samples)
        labels = dbscan.fit_predict(self.feature_matrix)

        num_clusters = len(set(labels)) - (1 if -1 in labels else 0)

        # Compute silhouette score
        if num_clusters > 1:
            score = silhouette_score(self.feature_matrix, labels)
        else:
            score = 0.0

        return ClusterResult(
            cluster_labels=labels,
            cluster_centers=None,
            num_clusters=num_clusters,
            silhouette_score=score
        )

    def cluster_hierarchical(
        self,
        n_clusters: int = 5,
        linkage: str = 'ward'
    ) -> ClusterResult:
        """
        Hierarchical agglomerative clustering.
        """
        if self.feature_matrix is None:
            self.build_feature_matrix()

        clustering = AgglomerativeClustering(n_clusters=n_clusters, linkage=linkage)
        labels = clustering.fit_predict(self.feature_matrix)

        # Compute silhouette score
        if len(set(labels)) > 1:
            score = silhouette_score(self.feature_matrix, labels)
        else:
            score = 0.0

        return ClusterResult(
            cluster_labels=labels,
            cluster_centers=None,
            num_clusters=n_clusters,
            silhouette_score=score
        )

    def reduce_dimensions_pca(self, n_components: int = 2) -> np.ndarray:
        """
        Reduce dimensionality using PCA for visualization.
        """
        if self.feature_matrix is None:
            self.build_feature_matrix()

        self.pca_model = PCA(n_components=n_components)
        reduced = self.pca_model.fit_transform(self.feature_matrix)

        return reduced

    def reduce_dimensions_tsne(self, n_components: int = 2, perplexity: int = 30) -> np.ndarray:
        """
        Reduce dimensionality using t-SNE for visualization.
        """
        if self.feature_matrix is None:
            self.build_feature_matrix()

        tsne = TSNE(n_components=n_components, perplexity=perplexity, random_state=42)
        reduced = tsne.fit_transform(self.feature_matrix)

        return reduced

    def find_similar_blocks(
        self,
        block_name: str,
        n_neighbors: int = 5
    ) -> List[SimilarityResult]:
        """
        Find most similar blocks to given block.
        """
        if self.feature_matrix is None:
            self.build_feature_matrix()

        if block_name not in self.block_names:
            raise ValueError(f"Block '{block_name}' not found")

        # Get block index
        block_idx = self.block_names.index(block_name)
        block_features = self.feature_matrix[block_idx].reshape(1, -1)

        # Find nearest neighbors
        if self.nn_model is None:
            self.nn_model = NearestNeighbors(n_neighbors=n_neighbors + 1, metric='euclidean')
            self.nn_model.fit(self.feature_matrix)

        distances, indices = self.nn_model.kneighbors(block_features)

        results = []
        for i, (dist, idx) in enumerate(zip(distances[0], indices[0])):
            if idx == block_idx:
                continue  # Skip self

            # Convert distance to similarity score (0-1)
            similarity = 1.0 / (1.0 + dist)

            results.append(SimilarityResult(
                block_name=self.block_names[idx],
                similarity_score=similarity,
                distance=float(dist)
            ))

        return results[:n_neighbors]

    def find_outliers(self, contamination: float = 0.1) -> List[str]:
        """
        Find outlier blocks using isolation forest approach.
        """
        if self.feature_matrix is None:
            self.build_feature_matrix()

        from sklearn.ensemble import IsolationForest

        iso_forest = IsolationForest(contamination=contamination, random_state=42)
        predictions = iso_forest.fit_predict(self.feature_matrix)

        # -1 indicates outlier
        outlier_indices = np.where(predictions == -1)[0]
        outlier_names = [self.block_names[i] for i in outlier_indices]

        return outlier_names

    def recommend_category(self, block_name: str, categories: Dict[str, List[str]]) -> str:
        """
        Recommend category for a block based on similarity to existing categorized blocks.
        """
        if self.feature_matrix is None:
            self.build_feature_matrix()

        if block_name not in self.block_names:
            raise ValueError(f"Block '{block_name}' not found")

        # Build category centroids
        category_centroids = {}
        for category, block_list in categories.items():
            indices = [self.block_names.index(b) for b in block_list if b in self.block_names]
            if indices:
                centroid = self.feature_matrix[indices].mean(axis=0)
                category_centroids[category] = centroid

        if not category_centroids:
            return "uncategorized"

        # Find closest category
        block_idx = self.block_names.index(block_name)
        block_features = self.feature_matrix[block_idx]

        min_distance = float('inf')
        best_category = "uncategorized"

        for category, centroid in category_centroids.items():
            distance = np.linalg.norm(block_features - centroid)
            if distance < min_distance:
                min_distance = distance
                best_category = category

        return best_category

    def export_cluster_assignments(self, labels: np.ndarray, output_path: str):
        """
        Export cluster assignments to JSON.
        """
        clusters = {}
        for block_name, label in zip(self.block_names, labels):
            label_str = f"cluster_{int(label)}"
            if label_str not in clusters:
                clusters[label_str] = []
            clusters[label_str].append(block_name)

        with open(output_path, 'w') as f:
            json.dump(clusters, f, indent=2)

    def save_model(self, path: str):
        """
        Save trained models and data.
        """
        data = {
            'features': self.features,
            'feature_matrix': self.feature_matrix,
            'feature_names': self.feature_names,
            'block_names': self.block_names,
            'scaler': self.scaler,
            'kmeans_model': self.kmeans_model,
            'pca_model': self.pca_model
        }

        with open(path, 'wb') as f:
            pickle.dump(data, f)

    def load_model(self, path: str):
        """
        Load trained models and data.
        """
        with open(path, 'rb') as f:
            data = pickle.load(f)

        self.features = data['features']
        self.feature_matrix = data['feature_matrix']
        self.feature_names = data['feature_names']
        self.block_names = data['block_names']
        self.scaler = data['scaler']
        self.kmeans_model = data['kmeans_model']
        self.pca_model = data['pca_model']


def main():
    """
    Demo of ML block classification capabilities.
    """
    print("=" * 60)
    print("ML Block Classifier Demo")
    print("=" * 60)

    classifier = MLBlockClassifier()

    # Generate synthetic block data
    np.random.seed(42)

    for i in range(50):
        # Create different types of blocks
        if i < 20:
            # Simple blocks
            num_entities = np.random.randint(5, 15)
            complexity = np.random.uniform(10, 30)
        else:
            # Complex blocks
            num_entities = np.random.randint(20, 50)
            complexity = np.random.uniform(50, 100)

        features = BlockFeatures(
            name=f"block_{i:03d}",
            num_entities=num_entities,
            num_vertices=num_entities * 4,
            bounding_box_area=np.random.uniform(100, 1000),
            bounding_box_aspect_ratio=np.random.uniform(0.5, 2.0),
            complexity_score=complexity,
            entity_type_distribution={'line': num_entities // 2, 'arc': num_entities // 2},
            centroid=(np.random.uniform(-100, 100), np.random.uniform(-100, 100)),
            layer_count=np.random.randint(1, 5),
            color_count=np.random.randint(1, 8)
        )

        classifier.add_block_features(features)

    print(f"\nAdded {len(classifier.features)} blocks")

    # Build feature matrix
    classifier.build_feature_matrix()
    print(f"Feature matrix shape: {classifier.feature_matrix.shape}")

    # K-Means clustering
    print("\nPerforming K-Means clustering (k=3)...")
    kmeans_result = classifier.cluster_kmeans(n_clusters=3)
    print(f"  Number of clusters: {kmeans_result.num_clusters}")
    print(f"  Silhouette score: {kmeans_result.silhouette_score:.3f}")

    # Find similar blocks
    print("\nFinding similar blocks to 'block_000'...")
    similar = classifier.find_similar_blocks('block_000', n_neighbors=5)
    for result in similar:
        print(f"  {result.block_name}: similarity={result.similarity_score:.3f}")

    # Find outliers
    print("\nFinding outlier blocks...")
    outliers = classifier.find_outliers(contamination=0.1)
    print(f"  Found {len(outliers)} outliers: {', '.join(outliers[:5])}")

    # PCA visualization
    print("\nReducing dimensions with PCA...")
    reduced = classifier.reduce_dimensions_pca(n_components=2)
    print(f"  Reduced to shape: {reduced.shape}")

    print("\n" + "=" * 60)
    print("Demo Complete!")
    print("=" * 60)


if __name__ == '__main__':
    main()
