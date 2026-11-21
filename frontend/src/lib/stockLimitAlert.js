import Swal from "sweetalert2";

const swalBase = {
  confirmButtonColor: "#497869",
  customClass: {
    popup: "font-sans",
    title: "font-sans",
    htmlContainer: "font-sans",
    confirmButton: "font-sans",
  },
};

const OUT_OF_STOCK_TEXT = "សោកស្តាយ! ទំនិញនេះអស់ពីស្តុកហើយ (Out of Stock)";
const STOCK_NOT_ENOUGH_TEXT =
  "ស្តុកមិនគ្រប់គ្រាន់សម្រាប់ចំនួនដែលអ្នកជ្រើស។ (Not enough stock for this quantity.)";

/** Customer-facing stock alerts (web storefront) — no exact stock counts shown. */
export async function showStockLimitAlert({ stock }) {
  const safeStock = Number.isFinite(Number(stock)) ? Math.max(0, Number(stock)) : 0;

  if (safeStock === 0) {
    await Swal.fire({
      icon: "error",
      text: OUT_OF_STOCK_TEXT,
      ...swalBase,
    });
    return;
  }

  await Swal.fire({
    icon: "warning",
    text: STOCK_NOT_ENOUGH_TEXT,
    ...swalBase,
  });
}
