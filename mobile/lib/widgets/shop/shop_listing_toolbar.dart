import 'package:flutter/material.dart';

import '../../l10n/l10n_extension.dart';

class ShopListingToolbar extends StatelessWidget {
  const ShopListingToolbar({
    super.key,
    required this.sort,
    required this.filterActiveCount,
    required this.onFilterTap,
    required this.onSortChanged,
  });

  final String sort;
  final int filterActiveCount;
  final VoidCallback onFilterTap;
  final ValueChanged<String> onSortChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Row(
        children: [
          _FilterButton(
            activeCount: filterActiveCount,
            onTap: onFilterTap,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _SortButton(
              sort: sort,
              onSortChanged: onSortChanged,
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterButton extends StatelessWidget {
  const _FilterButton({
    required this.activeCount,
    required this.onTap,
  });

  final int activeCount;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final label = l10n.filterWithCount(activeCount);
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return Material(
      color: Theme.of(context).colorScheme.surface,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.tune_rounded, size: 18, color: onSurface),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: onSurface,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SortButton extends StatelessWidget {
  const _SortButton({
    required this.sort,
    required this.onSortChanged,
  });

  final String sort;
  final ValueChanged<String> onSortChanged;

  Future<void> _openSortMenu(BuildContext context) async {
    final l10n = context.l10n;
    final selected = await showModalBottomSheet<String>(
      context: context,
      useRootNavigator: true,
      useSafeArea: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    l10n.sortBy,
                    style: Theme.of(sheetContext).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                ),
              ),
              ...l10n.sortOptions.map(
                (option) => ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                  leading: SizedBox(
                    width: 24,
                    child: option.value == sort
                        ? Icon(
                            Icons.check_rounded,
                            color: Theme.of(sheetContext).colorScheme.primary,
                          )
                        : null,
                  ),
                  title: Text(option.label),
                  onTap: () => Navigator.pop(sheetContext, option.value),
                ),
              ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );

    if (selected != null && selected != sort) {
      onSortChanged(selected);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final label = l10n.sortLabel(sort);
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final onSurfaceVariant = Theme.of(context).colorScheme.onSurfaceVariant;

    return Material(
      color: Theme.of(context).colorScheme.surface,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _openSortMenu(context),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Icon(Icons.swap_vert_rounded, size: 18, color: onSurface),
              const SizedBox(width: 8),
              Text(
                l10n.sortBy,
                style: TextStyle(fontWeight: FontWeight.w600, color: onSurface),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    color: onSurfaceVariant,
                    fontWeight: FontWeight.w500,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Icon(Icons.keyboard_arrow_down_rounded, color: onSurfaceVariant),
            ],
          ),
        ),
      ),
    );
  }
}
