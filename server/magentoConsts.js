export const PRODUCT_TYPE = {
  SIMPLE: "simple",
  GROUPED: "grouped",
  CONFIGURABLE: "configurable",
  VIRTUAL: "virtual",
  DOWNLOADABLE: "downloadable",
  GIFTCARD: "giftcard"
};

export const PRODUCT_VISIBLE = {
  NOT_VISIBLE: "1",
  IN_CATALOG: "2",
  IN_SEARCH: "3",
  BOTH: "4"
};

export const PRODUCT_STATUS = {
  ENABLE: "1",
  DISABLE: "2"
};

export const OPTION_TYPES = {
  TEXT: ["field", "area"],
  SELECTED: ["drop_down", "radio", "checkbox", "multiple"]
};

export const CSV_PRODUCT_HEADERS = ["sku", "_store", "_attribute_set", "_type", "_category", "_root_category", "_product_websites", "activedeal", "additionalfinformation", "additionalinfo", "affirm_product_mfp", "affirm_product_mfp_priority", "affirm_product_mfp_type", "bearing_options", "belt_tensioner", "blower_option", "bov_flange", "brake_pads_model", "catalytic_converter", "catback_option", "color", "compression", "core_option", "core_size", "cost", "country_of_manufacture", "created_at", "custom_design", "custom_design_from", "custom_design_to", "custom_layout_update", "description", "disable_amazonpayments", "downpipe_exit_flange", "downpipe_option", "engine", "engine_purchase", "exit", "flange_size", "free_shipping", "freight_class", "fuel_system", "gallery", "gift_message_available", "gift_wrapping_available", "gift_wrapping_price", "has_options", "header", "hid_model", "hose_size", "image", "image_label", "injectors", "injector_model", "inlet_outlet", "intake_manifold", `intercooler_size`, "is_returnable", "length", "machining_option", "maf_sensor", "magesms_optout", "manufacturer", "material", "media_gallery", "megnor_featured_product", "meta_description", "meta_keyword", "meta_title", "minimal_price", "model", "msrp", "msrp_display_actual_price_type", "msrp_enabled", "muffler_options", "must_ship_freight", "name", "news_from_date", "news_to_date", "option1", "options_container", "options_display_mode", "page_layout", "part_number", "price", "primaries", "pulley_size", "quantity", "related_tgtr_position_behavior", "related_tgtr_position_limit", "required_options", "resonator_option", "rotor", "scent", "shipperhq_additional_price", "shipperhq_availability_date", "shipperhq_carrier_code", "shipperhq_declared_value", "shipperhq_dim_group", "shipperhq_handling_fee", "shipperhq_location", "shipperhq_malleable_product", "shipperhq_master_boxes", "shipperhq_nmfc_class", "shipperhq_nmfc_sub", "shipperhq_poss_boxes", "shipperhq_shipping_fee", "shipperhq_shipping_group", "shipperhq_shipping_qty", "shipperhq_volume_weight", "shipperhq_warehouse", "ship_box_tolerance", "ship_height", "ship_length", "ship_separately", "ship_width", "shirt_size", "short_description", "side", "size", "size_basic", "size_bore", "small_image", "small_image_label", "smooth_ribbed", "special_from_date", "special_price", "special_to_date", "spring_size", "stage", "stall_speed", "status", "stud", "supercharger", "sweatshirt_vehicle_type", "tax_class_id", "thermostat_model", "thickness", "throttle_body", "thumbnail", "thumbnail_label", "transmission", "transmission_model", "turbo_model", "updated_at", "upsell_tgtr_position_behavior", "upsell_tgtr_position_limit", "url_key", "url_path", "vband_parts", "vehicle", "version", "visibility", "wastegate", "weight", "wideband_bung", "year", "qty", "min_qty", "use_config_min_qty", "is_qty_decimal", "backorders", "use_config_backorders", "min_sale_qty", "use_config_min_sale_qty", "max_sale_qty", "use_config_max_sale_qty", "is_in_stock", "notify_stock_qty", "use_config_notify_stock_qty", "manage_stock", "use_config_manage_stock", "stock_status_changed_auto", "use_config_qty_increments", "qty_increments", "use_config_enable_qty_inc", "enable_qty_increments", "is_decimal_divided", "_links_related_sku", "_links_related_position", "_links_crosssell_sku", "_links_crosssell_position", "_links_upsell_sku", "_links_upsell_position", "_associated_sku", "_associated_default_qty", "_associated_position", "_tier_price_website", "_tier_price_customer_group", "_tier_price_qty", "_tier_price_price", "_group_price_website", "_group_price_customer_group", "_group_price_price", "_media_attribute_id", "_media_image", "_media_lable", "_media_position", "_media_is_disabled", "_custom_option_store", "_custom_option_type", "_custom_option_title", "_custom_option_is_required", "_custom_option_price", "_custom_option_sku", "_custom_option_max_characters", "_custom_option_sort_order", "_custom_option_row_title", "_custom_option_row_price", "_custom_option_row_sku", "_custom_option_row_sort", "_super_products_sku", "_super_attribute_code", "_super_attribute_option", "_super_attribute_price_corr"];

export const ORDER_STATUSES = {
  COMPLETED: {
    complete: "complete"
  },
  PROCESSING: {
    pending: "pending",
    holded: "holded",
    paymentReview: "payment_review",
    paypalCanceledReversal: "paypal_canceled_reversal",
    paypalReversal: "paypal_reversed",
    pendingOgone: "pending_ogone",
    pendingPayment: "pending_payment",
    pendingPaypal: "pending_paypal",
    processedOgone: "processed_ogone",
    processing: "processing",
    processingOgone: "processing_ogone"
  }
};
