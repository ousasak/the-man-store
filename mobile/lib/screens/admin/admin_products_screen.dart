import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/admin_permissions.dart';
import '../../core/api_client.dart';
import '../../models/user_model.dart';
import '../../l10n/l10n_extension.dart';
import '../../services/admin_service.dart';
import '../../theme/admin_theme.dart';
import '../../theme/app_colors.dart';
import '../../utils/admin_context.dart';
import '../../utils/media_url.dart';
import '../../widgets/admin/admin_access_denied.dart';
import '../../widgets/admin/admin_ui_kit.dart';
import '../../widgets/common/fs_empty_state.dart';
import '../../widgets/product_image.dart';
import 'admin_product_edit_screen.dart';

class AdminProductsScreen extends StatefulWidget {
  const AdminProductsScreen({super.key, required this.user, this.embedded = false});

  final UserModel user;
  final bool embedded;

  @override
  State<AdminProductsScreen> createState() => _AdminProductsScreenState();
}

class _AdminProductsScreenState extends State<AdminProductsScreen> {
  final _searchController = TextEditingController();
  final List<AdminProductModel> _products = [];
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  int _page = 1;
  bool _hasMore = true;

  @override
  void initState() {
    super.initState();
    _load(reset: true);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load({bool reset = false}) async {
    if (reset) {
      setState(() {
        _loading = true;
        _error = null;
        _page = 1;
        _hasMore = true;
        _products.clear();
      });
    } else {
      setState(() => _loadingMore = true);
    }

    try {
      final service = AdminService(context.read<ApiClient>());
      final result = await service.listProducts(
        page: _page,
        query: _searchController.text.trim(),
      );
      if (!mounted) return;
      setState(() {
        _products.addAll(result.items);
        _hasMore = result.hasMore;
        _page = result.currentPage + 1;
        _loading = false;
        _loadingMore = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = context.read<ApiClient>().apiMessage(e);
        _loading = false;
        _loadingMore = false;
      });
    }
  }

  Future<void> _adjustStock(AdminProductModel product, int delta) async {
    if (!AdminPermissions.has(widget.user, 'products', 'edit')) return;
    final next = (product.stock + delta).clamp(0, 999999);
    try {
      await AdminService(context.read<ApiClient>()).quickUpdateProduct(product.id, stock: next);
      if (!mounted) return;
      setState(() {
        final i = _products.indexWhere((p) => p.id == product.id);
        if (i >= 0) {
          _products[i] = AdminProductModel(
            id: product.id,
            name: product.name,
            slug: product.slug,
            price: product.price,
            stock: next,
            isActive: product.isActive,
            sku: product.sku,
            imageUrl: product.imageUrl,
            categoryName: product.categoryName,
          );
        }
      });
    } on DioException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.read<ApiClient>().apiMessage(e))));
    }
  }

  Future<void> _toggleActive(AdminProductModel product) async {
    if (!AdminPermissions.has(widget.user, 'products', 'edit')) return;
    try {
      final updated = await AdminService(context.read<ApiClient>()).quickUpdateProduct(product.id, isActive: !product.isActive);
      if (!mounted) return;
      setState(() {
        final i = _products.indexWhere((p) => p.id == product.id);
        if (i >= 0) _products[i] = updated;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.read<ApiClient>().apiMessage(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.adminL10n;
    if (!AdminPermissions.has(widget.user, 'products', 'view')) {
      return AdminTabScaffold(
        title: l10n.products,
        child: AdminAccessDenied(title: 'Products access denied'),
      );
    }

    final fmt = AdminFmt.of(context);
    final canEdit = AdminPermissions.has(widget.user, 'products', 'edit');
    final primary = Theme.of(context).colorScheme.primary;

    Widget content;
    if (_loading) {
      content = Center(child: CircularProgressIndicator(color: primary));
    } else if (_error != null) {
      content = FsEmptyState(
        icon: Icons.inventory_2_outlined,
        title: 'Could not load products',
        subtitle: _error,
        actionLabel: l10n.retry,
        onAction: () => _load(reset: true),
      );
    } else if (_products.isEmpty) {
      content = const FsEmptyState(
        icon: Icons.inventory_2_outlined,
        title: 'No products',
        subtitle: 'Products you add on web will appear here.',
      );
    } else {
      content = RefreshIndicator(
        color: primary,
        onRefresh: () => _load(reset: true),
        child: ListView.builder(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 100),
          itemCount: _products.length + (_hasMore ? 1 : 0),
          itemBuilder: (context, index) {
            if (index >= _products.length) {
              if (_loadingMore) {
                return Padding(
                  padding: const EdgeInsets.all(16),
                  child: Center(child: CircularProgressIndicator(color: primary)),
                );
              }
              _load();
              return const SizedBox.shrink();
            }
            final product = _products[index];
            final imageUrl = resolveMediaUrl(product.imageUrl);
            final stockColor = product.stock <= 0
                ? AppColors.error
                : product.stock <= 5
                    ? AppColors.warning
                    : AppColors.success;

            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: AdminSoftCard(
                child: Column(
                  children: [
                    AdminListRow(
                      index: index,
                      title: product.name,
                      subtitle: '${fmt.usd(product.price)} · ${product.isActive ? 'Active' : 'Hidden'}',
                      onTap: canEdit
                          ? () async {
                              final updated = await Navigator.of(context).push<bool>(
                                MaterialPageRoute(
                                  builder: (_) => Theme(
                                    data: Theme.of(context),
                                    child: AdminProductEditScreen(productId: product.id),
                                  ),
                                ),
                              );
                              if (updated == true) _load(reset: true);
                            }
                          : null,
                      leading: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: SizedBox(
                          width: 48,
                          height: 48,
                          child: imageUrl.isNotEmpty
                              ? ProductImage(imageUrl: imageUrl, fit: BoxFit.cover)
                              : ColoredBox(
                                  color: AdminColors.accentLight,
                                  child: Icon(Icons.image_outlined, color: AdminColors.accent.withValues(alpha: 0.5)),
                                ),
                        ),
                      ),
                      trailing: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: stockColor.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text('${product.stock}', style: TextStyle(fontWeight: FontWeight.w700, color: stockColor, fontSize: 12)),
                      ),
                    ),
                    if (canEdit)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                        child: Row(
                          children: [
                            IconButton(onPressed: () => _adjustStock(product, -1), icon: const Icon(Icons.remove_circle_outline)),
                            Text('${product.stock}', style: const TextStyle(fontWeight: FontWeight.w700)),
                            IconButton(onPressed: () => _adjustStock(product, 1), icon: const Icon(Icons.add_circle_outline)),
                            const Spacer(),
                            Switch(value: product.isActive, onChanged: (_) => _toggleActive(product)),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            );
          },
        ),
      );
    }

    return AdminTabScaffold(
      title: l10n.products,
      subtitle: _loading ? 'Loading…' : '${_products.length} items',
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 0, 22, 12),
            child: AdminSearchField(
              controller: _searchController,
              hint: 'Search products',
              onSubmitted: (_) => _load(reset: true),
              onRefresh: () => _load(reset: true),
            ),
          ),
          Expanded(child: content),
        ],
      ),
    );
  }
}
