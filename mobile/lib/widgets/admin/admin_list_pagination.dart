import 'package:flutter/material.dart';

/// Footer shown at the end of paginated admin lists.
class AdminListLoadMoreFooter extends StatelessWidget {
  const AdminListLoadMoreFooter({
    super.key,
    required this.loading,
    required this.hasMore,
    required this.onLoadMore,
    this.dense = false,
  });

  final bool loading;
  final bool hasMore;
  final VoidCallback onLoadMore;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    if (!hasMore) return SizedBox(height: dense ? 8 : 16);
    if (loading) {
      return Padding(
        padding: EdgeInsets.symmetric(vertical: dense ? 12 : 20),
        child: const Center(child: CircularProgressIndicator()),
      );
    }
    return Padding(
      padding: EdgeInsets.only(top: dense ? 4 : 8, bottom: dense ? 12 : 20),
      child: Center(
        child: TextButton(onPressed: onLoadMore, child: const Text('Load more')),
      ),
    );
  }
}

/// List padding that tightens when many rows are shown.
EdgeInsets adminListPadding(int itemCount) =>
    EdgeInsets.fromLTRB(16, 8, 16, itemCount > 12 ? 8 : 16);

double adminListItemGap(int itemCount) => itemCount > 12 ? 6 : 10;
