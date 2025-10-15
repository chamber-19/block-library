"""
Analytics Engine
Advanced data analytics and visualization for CAD block library.
Uses Pandas for data processing and statistical analysis.
"""

import sys
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass
from datetime import datetime, timedelta
import json

try:
    import pandas as pd
    import numpy as np
    import matplotlib.pyplot as plt
    import matplotlib
    matplotlib.use('Agg')  # Non-interactive backend
except ImportError:
    print("Pandas/Matplotlib not installed. Run: pip install pandas matplotlib")
    sys.exit(1)

sys.path.insert(0, str(Path(__file__).parent))


@dataclass
class UsageStats:
    """Block usage statistics"""
    total_blocks: int
    total_usages: int
    avg_usage_per_block: float
    most_used_blocks: List[Tuple[str, int]]
    least_used_blocks: List[Tuple[str, int]]
    usage_by_category: Dict[str, int]
    usage_by_date: Dict[str, int]


@dataclass
class LibraryHealth:
    """Library health metrics"""
    total_files: int
    total_blocks: int
    avg_blocks_per_file: float
    files_with_errors: int
    duplicate_blocks: int
    orphaned_blocks: int
    health_score: float


class AnalyticsEngine:
    """
    Advanced analytics engine for CAD block library.
    Provides statistics, trends, and insights.
    """

    def __init__(self):
        self.blocks_df: Optional[pd.DataFrame] = None
        self.usage_df: Optional[pd.DataFrame] = None
        self.files_df: Optional[pd.DataFrame] = None

    def load_blocks_data(self, data: List[Dict[str, Any]]):
        """
        Load blocks data into DataFrame.
        Expected fields: name, category, file_path, created_at, updated_at, metadata
        """
        self.blocks_df = pd.DataFrame(data)

        # Convert timestamps
        if 'created_at' in self.blocks_df.columns:
            self.blocks_df['created_at'] = pd.to_datetime(self.blocks_df['created_at'])
        if 'updated_at' in self.blocks_df.columns:
            self.blocks_df['updated_at'] = pd.to_datetime(self.blocks_df['updated_at'])

    def load_usage_data(self, data: List[Dict[str, Any]]):
        """
        Load usage tracking data.
        Expected fields: block_name, timestamp, user, project
        """
        self.usage_df = pd.DataFrame(data)

        if 'timestamp' in self.usage_df.columns:
            self.usage_df['timestamp'] = pd.to_datetime(self.usage_df['timestamp'])

    def load_files_data(self, data: List[Dict[str, Any]]):
        """
        Load files data.
        Expected fields: path, size, modified_at, block_count, status
        """
        self.files_df = pd.DataFrame(data)

        if 'modified_at' in self.files_df.columns:
            self.files_df['modified_at'] = pd.to_datetime(self.files_df['modified_at'])

    def get_usage_statistics(self) -> UsageStats:
        """
        Calculate comprehensive usage statistics.
        """
        if self.blocks_df is None or self.usage_df is None:
            raise ValueError("Data not loaded")

        # Total blocks
        total_blocks = len(self.blocks_df)

        # Total usages
        total_usages = len(self.usage_df)

        # Average usage per block
        usage_counts = self.usage_df.groupby('block_name').size()
        avg_usage = usage_counts.mean() if len(usage_counts) > 0 else 0.0

        # Most used blocks
        most_used = usage_counts.nlargest(10).to_dict()
        most_used_list = [(name, int(count)) for name, count in most_used.items()]

        # Least used blocks
        least_used = usage_counts.nsmallest(10).to_dict()
        least_used_list = [(name, int(count)) for name, count in least_used.items()]

        # Usage by category
        if 'category' in self.blocks_df.columns:
            merged = self.usage_df.merge(self.blocks_df[['name', 'category']],
                                        left_on='block_name', right_on='name', how='left')
            usage_by_category = merged.groupby('category').size().to_dict()
        else:
            usage_by_category = {}

        # Usage by date
        self.usage_df['date'] = self.usage_df['timestamp'].dt.date
        usage_by_date = self.usage_df.groupby('date').size().to_dict()
        usage_by_date = {str(k): int(v) for k, v in usage_by_date.items()}

        return UsageStats(
            total_blocks=total_blocks,
            total_usages=total_usages,
            avg_usage_per_block=float(avg_usage),
            most_used_blocks=most_used_list,
            least_used_blocks=least_used_list,
            usage_by_category=usage_by_category,
            usage_by_date=usage_by_date
        )

    def get_library_health(self) -> LibraryHealth:
        """
        Calculate library health metrics.
        """
        if self.blocks_df is None or self.files_df is None:
            raise ValueError("Data not loaded")

        total_files = len(self.files_df)
        total_blocks = len(self.blocks_df)

        # Average blocks per file
        if 'block_count' in self.files_df.columns:
            avg_blocks = self.files_df['block_count'].mean()
        else:
            avg_blocks = total_blocks / total_files if total_files > 0 else 0

        # Files with errors
        if 'status' in self.files_df.columns:
            files_with_errors = len(self.files_df[self.files_df['status'] == 'error'])
        else:
            files_with_errors = 0

        # Duplicate blocks (same name)
        duplicate_blocks = len(self.blocks_df[self.blocks_df.duplicated('name', keep=False)])

        # Orphaned blocks (no file reference)
        if 'file_path' in self.blocks_df.columns:
            orphaned_blocks = len(self.blocks_df[self.blocks_df['file_path'].isna()])
        else:
            orphaned_blocks = 0

        # Health score (0-100)
        error_penalty = (files_with_errors / total_files * 20) if total_files > 0 else 0
        duplicate_penalty = (duplicate_blocks / total_blocks * 30) if total_blocks > 0 else 0
        orphan_penalty = (orphaned_blocks / total_blocks * 20) if total_blocks > 0 else 0
        health_score = max(0, 100 - error_penalty - duplicate_penalty - orphan_penalty)

        return LibraryHealth(
            total_files=total_files,
            total_blocks=total_blocks,
            avg_blocks_per_file=float(avg_blocks),
            files_with_errors=files_with_errors,
            duplicate_blocks=duplicate_blocks,
            orphaned_blocks=orphaned_blocks,
            health_score=float(health_score)
        )

    def get_trending_blocks(self, days: int = 7, top_n: int = 10) -> List[Tuple[str, int, float]]:
        """
        Get trending blocks (increasing usage).
        Returns (block_name, current_count, growth_rate)
        """
        if self.usage_df is None:
            raise ValueError("Usage data not loaded")

        # Filter recent data
        cutoff_date = datetime.now() - timedelta(days=days)
        recent = self.usage_df[self.usage_df['timestamp'] >= cutoff_date].copy()

        if len(recent) == 0:
            return []

        # Split into two periods
        mid_date = cutoff_date + timedelta(days=days/2)
        period1 = recent[recent['timestamp'] < mid_date]
        period2 = recent[recent['timestamp'] >= mid_date]

        # Count usages in each period
        counts1 = period1.groupby('block_name').size()
        counts2 = period2.groupby('block_name').size()

        # Calculate growth rate
        growth = []
        for block in counts2.index:
            count1 = counts1.get(block, 0)
            count2 = counts2[block]

            if count1 > 0:
                growth_rate = (count2 - count1) / count1
            else:
                growth_rate = float('inf') if count2 > 0 else 0

            growth.append((block, int(count2), float(growth_rate)))

        # Sort by growth rate
        growth.sort(key=lambda x: x[2], reverse=True)

        return growth[:top_n]

    def get_category_distribution(self) -> Dict[str, int]:
        """
        Get distribution of blocks by category.
        """
        if self.blocks_df is None:
            raise ValueError("Blocks data not loaded")

        if 'category' not in self.blocks_df.columns:
            return {}

        return self.blocks_df['category'].value_counts().to_dict()

    def get_usage_timeline(self, frequency: str = 'D') -> pd.Series:
        """
        Get usage timeline.
        Frequency: 'D' (daily), 'W' (weekly), 'M' (monthly)
        """
        if self.usage_df is None:
            raise ValueError("Usage data not loaded")

        timeline = self.usage_df.set_index('timestamp').resample(frequency).size()
        return timeline

    def get_user_statistics(self) -> Dict[str, Any]:
        """
        Get user activity statistics.
        """
        if self.usage_df is None or 'user' not in self.usage_df.columns:
            return {}

        total_users = self.usage_df['user'].nunique()
        active_users = self.usage_df[
            self.usage_df['timestamp'] >= datetime.now() - timedelta(days=30)
        ]['user'].nunique()

        user_usage = self.usage_df.groupby('user').size()
        top_users = user_usage.nlargest(10).to_dict()

        return {
            'total_users': int(total_users),
            'active_users_30d': int(active_users),
            'avg_usage_per_user': float(user_usage.mean()),
            'top_users': top_users
        }

    def get_file_statistics(self) -> Dict[str, Any]:
        """
        Get file-related statistics.
        """
        if self.files_df is None:
            return {}

        total_size = self.files_df['size'].sum() if 'size' in self.files_df.columns else 0
        avg_size = self.files_df['size'].mean() if 'size' in self.files_df.columns else 0

        # File age distribution
        if 'modified_at' in self.files_df.columns:
            now = pd.Timestamp.now()
            self.files_df['age_days'] = (now - self.files_df['modified_at']).dt.days

            age_bins = [0, 30, 90, 180, 365, float('inf')]
            age_labels = ['0-30 days', '31-90 days', '91-180 days', '181-365 days', '365+ days']
            self.files_df['age_category'] = pd.cut(
                self.files_df['age_days'],
                bins=age_bins,
                labels=age_labels
            )

            age_distribution = self.files_df['age_category'].value_counts().to_dict()
        else:
            age_distribution = {}

        return {
            'total_files': len(self.files_df),
            'total_size_mb': float(total_size / (1024 * 1024)),
            'avg_size_mb': float(avg_size / (1024 * 1024)),
            'age_distribution': age_distribution
        }

    def export_report(self, output_path: str, include_charts: bool = True):
        """
        Export comprehensive analytics report.
        """
        report = {
            'generated_at': datetime.now().isoformat(),
            'usage_stats': None,
            'library_health': None,
            'trending_blocks': None,
            'category_distribution': None,
            'user_statistics': None,
            'file_statistics': None
        }

        try:
            if self.blocks_df is not None and self.usage_df is not None:
                usage_stats = self.get_usage_statistics()
                report['usage_stats'] = {
                    'total_blocks': usage_stats.total_blocks,
                    'total_usages': usage_stats.total_usages,
                    'avg_usage_per_block': usage_stats.avg_usage_per_block,
                    'most_used_blocks': usage_stats.most_used_blocks[:5],
                    'usage_by_category': usage_stats.usage_by_category
                }

                trending = self.get_trending_blocks(days=7, top_n=5)
                report['trending_blocks'] = [(name, count, rate) for name, count, rate in trending]

        except Exception as e:
            print(f"Error calculating usage stats: {e}")

        try:
            if self.blocks_df is not None and self.files_df is not None:
                health = self.get_library_health()
                report['library_health'] = {
                    'total_files': health.total_files,
                    'total_blocks': health.total_blocks,
                    'health_score': health.health_score,
                    'files_with_errors': health.files_with_errors,
                    'duplicate_blocks': health.duplicate_blocks
                }
        except Exception as e:
            print(f"Error calculating health: {e}")

        try:
            report['category_distribution'] = self.get_category_distribution()
        except:
            pass

        try:
            report['user_statistics'] = self.get_user_statistics()
        except:
            pass

        try:
            report['file_statistics'] = self.get_file_statistics()
        except:
            pass

        # Save JSON report
        with open(output_path, 'w') as f:
            json.dump(report, f, indent=2, default=str)

        # Generate charts if requested
        if include_charts:
            self._generate_charts(Path(output_path).parent)

    def _generate_charts(self, output_dir: Path):
        """
        Generate visualization charts.
        """
        output_dir.mkdir(exist_ok=True)

        # Usage timeline
        if self.usage_df is not None:
            try:
                timeline = self.get_usage_timeline(frequency='D')
                plt.figure(figsize=(12, 6))
                timeline.plot(kind='line', marker='o')
                plt.title('Block Usage Over Time')
                plt.xlabel('Date')
                plt.ylabel('Number of Usages')
                plt.grid(True, alpha=0.3)
                plt.tight_layout()
                plt.savefig(output_dir / 'usage_timeline.png', dpi=150)
                plt.close()
            except Exception as e:
                print(f"Error generating timeline chart: {e}")

        # Category distribution
        if self.blocks_df is not None and 'category' in self.blocks_df.columns:
            try:
                dist = self.get_category_distribution()
                plt.figure(figsize=(10, 8))
                pd.Series(dist).plot(kind='pie', autopct='%1.1f%%')
                plt.title('Blocks by Category')
                plt.ylabel('')
                plt.tight_layout()
                plt.savefig(output_dir / 'category_distribution.png', dpi=150)
                plt.close()
            except Exception as e:
                print(f"Error generating category chart: {e}")


def main():
    """
    Demo of analytics engine capabilities.
    """
    print("=" * 60)
    print("Analytics Engine Demo")
    print("=" * 60)

    engine = AnalyticsEngine()

    # Generate synthetic data
    np.random.seed(42)

    # Blocks data
    categories = ['Mechanical', 'Electrical', 'Architectural', 'Plumbing', 'HVAC']
    blocks_data = []
    for i in range(100):
        blocks_data.append({
            'name': f'block_{i:03d}',
            'category': np.random.choice(categories),
            'file_path': f'/path/to/file_{i//10}.dwg',
            'created_at': datetime.now() - timedelta(days=np.random.randint(0, 365)),
            'updated_at': datetime.now() - timedelta(days=np.random.randint(0, 30))
        })

    engine.load_blocks_data(blocks_data)
    print(f"\nLoaded {len(blocks_data)} blocks")

    # Usage data
    usage_data = []
    for _ in range(500):
        usage_data.append({
            'block_name': f'block_{np.random.randint(0, 100):03d}',
            'timestamp': datetime.now() - timedelta(days=np.random.randint(0, 30)),
            'user': f'user_{np.random.randint(1, 11)}',
            'project': f'project_{np.random.randint(1, 6)}'
        })

    engine.load_usage_data(usage_data)
    print(f"Loaded {len(usage_data)} usage records")

    # Files data
    files_data = []
    for i in range(10):
        files_data.append({
            'path': f'/path/to/file_{i}.dwg',
            'size': np.random.randint(100000, 10000000),
            'modified_at': datetime.now() - timedelta(days=np.random.randint(0, 180)),
            'block_count': 10,
            'status': 'ok' if np.random.random() > 0.1 else 'error'
        })

    engine.load_files_data(files_data)
    print(f"Loaded {len(files_data)} file records")

    # Calculate statistics
    print("\n" + "=" * 60)
    print("Usage Statistics")
    print("=" * 60)
    stats = engine.get_usage_statistics()
    print(f"Total blocks: {stats.total_blocks}")
    print(f"Total usages: {stats.total_usages}")
    print(f"Average usage per block: {stats.avg_usage_per_block:.2f}")
    print(f"\nTop 5 most used blocks:")
    for name, count in stats.most_used_blocks[:5]:
        print(f"  {name}: {count} uses")

    print("\n" + "=" * 60)
    print("Library Health")
    print("=" * 60)
    health = engine.get_library_health()
    print(f"Health score: {health.health_score:.1f}/100")
    print(f"Total files: {health.total_files}")
    print(f"Total blocks: {health.total_blocks}")
    print(f"Files with errors: {health.files_with_errors}")

    print("\n" + "=" * 60)
    print("Demo Complete!")
    print("=" * 60)


if __name__ == '__main__':
    main()
