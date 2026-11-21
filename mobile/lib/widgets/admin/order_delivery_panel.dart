import 'package:flutter/material.dart';

import '../../services/admin_service.dart';
import 'admin_ui_kit.dart';

class OrderDeliveryPanel extends StatelessWidget {
  const OrderDeliveryPanel({
    super.key,
    required this.order,
    required this.onOpenShopInvoice,
  });

  final AdminOrderDetail order;
  final VoidCallback onOpenShopInvoice;

  @override
  Widget build(BuildContext context) {
    final courier = order.courierLabel;
    final hasPickup =
        order.pickedUpByName != null && order.pickedUpByName!.isNotEmpty;

    return AdminSoftCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AdminSectionTitle(title: 'Delivery / ការដឹកជញ្ជូន'),
          const SizedBox(height: 8),
          if (courier != null)
            Text('ក្រុមហ៊ុនដឹក / Courier: $courier',
                style: const TextStyle(fontWeight: FontWeight.w600)),
          if (order.shipmentStatus != null)
            Text('ស្ថានភាព / Status: ${order.shipmentStatus}'),
          if (hasPickup)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'យកពីហាង / Picked up by: ${order.pickedUpByName}'
                '${order.pickedUpByPhone != null && order.pickedUpByPhone!.isNotEmpty ? ' · ${order.pickedUpByPhone}' : ''}',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
            )
          else if (order.shipmentId != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'កត់អ្នកដឹកមកយកពីហាងនៅ Web Admin (Courier tracking).',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: onOpenShopInvoice,
            icon: const Icon(Icons.receipt_long_outlined, size: 18),
            label: const Text('វិក័យបត្រ ហាង / Shop delivery note'),
          ),
        ],
      ),
    );
  }
}
