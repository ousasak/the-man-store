import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../l10n/l10n_extension.dart';
import '../models/brand_model.dart';
import '../models/product_filters.dart';
import '../models/product_model.dart';
import '../providers/auth_provider.dart';
import '../providers/wishlist_provider.dart';
import '../services/product_service.dart';
import '../utils/media_url.dart';
import '../widgets/common/fs_empty_state.dart';
import '../widgets/navigation/home_store_header.dart';
import '../widgets/product_card.dart';
import '../widgets/product_image.dart';
import '../widgets/shop/shop_filter_sheet.dart';
import '../widgets/shop/shop_listing_toolbar.dart';
import 'product_detail_screen.dart';

/// Brand catalogue — mirrors web `/brands/:slug`.
class BrandProductsScreen extends StatefulWidget {
  const BrandProductsScreen({
    super.key,
    required this.brand,
    required this.productService,
    required this.apiClient,
  });

  final BrandModel brand;
  final ProductService productService;
  final ApiClient apiClient;

  @override
  State<BrandProductsScreen> createState() => _BrandProductsScreenState();
}

class _BrandProductsScreenState extends State<BrandProductsScreen> {
  final _scrollController = ScrollController();
  final _products = <ProductModel>[];
  ProductFilters _filters = ProductFilters();
  FilterOptionsModel? _filterOptions;
  List<BrandModel> _brands = [];

  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  int _page = 1;
  bool _hasMore = true;
  int _requestId = 0;

  @override
  void initState() {
    super.initState();
    _bootstrap();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    await Future.wait([
      _loadBrandsAndFilterOptions(),
      _loadProducts(reset: true),
    ]);
  }

  Future<void> _loadBrandsAndFilterOptions() async {
    try {
      final results = await Future.wait([
        widget.productService.listBrands(),
        widget.productService.fetchFilterOptions(),
      ]);
      if (!mounted) return;
      setState(() {
        _brands = results[0] as List<BrandModel>;
        _filterOptions = results[1] as FilterOptionsModel;
      });
    } catch (_) {
      /* optional */
    }
  }

  void _onScroll() {
    if (!_hasMore || _loadingMore || _loading) return;
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 240) {
      _loadMore();
    }
  }

  Future<void> _loadProducts({required bool reset}) async {
    final requestId = ++_requestId;
    if (reset) {
      setState(() {
        _loading = true;
        _error = null;
        _page = 1;
        _hasMore = true;
      });
    }
    try {
      final page = await widget.productService.listProducts(
        page: 1,
        brandId: widget.brand.id,
        brandSlug: widget.brand.slug,
        filters: _filters,
      );
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _products
          ..clear()
          ..addAll(page.items);
        _page = page.currentPage;
        _hasMore = page.hasMore;
        _loading = false;
      });
    } on DioException catch (e) {
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _error = widget.apiClient.apiMessage(e);
        _loading = false;
      });
    } catch (e) {
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (!_hasMore) return;
    final requestId = _requestId;
    setState(() => _loadingMore = true);
    try {
      final nextPage = _page + 1;
      final page = await widget.productService.listProducts(
        page: nextPage,
        brandId: widget.brand.id,
        brandSlug: widget.brand.slug,
        filters: _filters,
      );
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _products.addAll(page.items);
        _page = page.currentPage;
        _hasMore = page.hasMore;
        _loadingMore = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  Future<void> _openFilters() async {
    final result = await ShopFilterSheet.show(
      context,
      initial: _filters.copy()..brandIds.add(widget.brand.id),
      brands: _brands,
      filterOptions: _filterOptions,
    );
    if (result == null || !mounted) return;
    setState(() {
      _filters = result;
      if (!_filters.brandIds.contains(widget.brand.id)) {
        _filters.brandIds.add(widget.brand.id);
      }
    });
    await _reloadProducts();
  }

  void _onSortChanged(String sort) {
    if (_filters.sort == sort) return;
    setState(() => _filters.sort = sort);
    _reloadProducts();
  }

  Future<void> _reloadProducts() async {
    if (_scrollController.hasClients) {
      await _scrollController.animateTo(
        0,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    }
    await _loadProducts(reset: true);
  }

  int get _filterActiveCount => _filters.activeCount(
        boundsMin: _filterOptions?.priceMin,
        boundsMax: _filterOptions?.priceMax,
      );

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final logoUrl = resolveMediaUrl(widget.brand.logoUrl);

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: Column(
        children: [
          InnerPageHeader(
            title: widget.brand.name,
            subtitle: l10n.productsByBrand,
            onBack: () => Navigator.of(context).pop(),
          ),
          Expanded(child: _buildBody(logoUrl)),
        ],
      ),
    );
  }

  Widget _buildBody(String logoUrl) {
    if (_error != null && _products.isEmpty) {
      return FsEmptyState(
        icon: Icons.cloud_off_outlined,
        title: context.l10n.searchUnavailable,
        subtitle: _error,
        actionLabel: context.l10n.retry,
        onAction: () => _loadProducts(reset: true),
      );
    }

    return RefreshIndicator(
      onRefresh: () => _loadProducts(reset: true),
      child: CustomScrollView(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          if (logoUrl.isNotEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Center(
                  child: SizedBox(
                    height: 56,
                    width: 140,
                    child: ProductImage(
                      imageUrl: logoUrl,
                      fit: BoxFit.contain,
                    ),
                  ),
                ),
              ),
            ),
          SliverToBoxAdapter(
            child: ShopListingToolbar(
              sort: _filters.sort,
              filterActiveCount: _filterActiveCount,
              onFilterTap: _openFilters,
              onSortChanged: _onSortChanged,
            ),
          ),
          if (_loading && _products.isNotEmpty)
            const SliverToBoxAdapter(
              child: LinearProgressIndicator(minHeight: 2),
            ),
          if (_loading && _products.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_products.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: FsEmptyState(
                icon: Icons.inventory_2_outlined,
                title: context.l10n.noProductsFound,
                minimal: true,
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              sliver: SliverGrid(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  childAspectRatio: productCardGridAspectRatio,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                ),
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    if (index >= _products.length) {
                      return const Center(
                        child: Padding(
                          padding: EdgeInsets.all(16),
                          child: CircularProgressIndicator(),
                        ),
                      );
                    }
                    final product = _products[index];
                    return Consumer2<AuthProvider, WishlistProvider>(
                      builder: (context, auth, wishlist, _) {
                        return ProductCard(
                          layout: ProductCardLayout.imageFocus,
                          product: product,
                          isWishlisted: wishlist.has(product.id),
                          onWishlistToggle: () => wishlist.toggle(
                            product.id,
                            isLoggedIn: auth.isLoggedIn,
                            product: product,
                          ),
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => ProductDetailScreen(
                                productService: widget.productService,
                                slug: product.slug,
                              ),
                            ),
                          ),
                        );
                      },
                    );
                  },
                  childCount: _products.length + (_loadingMore ? 1 : 0),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
