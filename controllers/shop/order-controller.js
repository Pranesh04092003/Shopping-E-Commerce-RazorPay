require("dotenv").config();  // Load environment variables from .env file

const razorpay = require("razorpay");  // Import Razorpay SDK
const Order = require("../../models/Order");
const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
const User = require("../../models/User");  // Adjust the path as per your project structure

// Razorpay instance (using environment variables for Razorpay credentials)
const razorpayInstance = new razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,        // Access Razorpay Key ID from environment variables
  key_secret: process.env.RAZORPAY_KEY_SECRET, // Access Razorpay Key Secret from environment variables
});

const createOrder = async (req, res) => {
  try {
    const {
      userId,
      cartItems,
      addressInfo,
      orderStatus,
      paymentMethod,
      paymentStatus,
      totalAmount,
      orderDate,
      orderUpdateDate,
      paymentId,
      payerId,
      cartId,
    } = req.body;

    // Fetch the user by userId to get the username
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userName = user.userName;  // Assuming `userName` is a field in your User model

    // Create a Razorpay order
    const razorpayOrder = await razorpayInstance.orders.create({
      amount: totalAmount * 100,  // Razorpay expects the amount in paise (1 INR = 100 paise)
      currency: "INR",            // Use the currency you're dealing with, e.g., INR or USD
      receipt: `order_rcptid_${new Date().getTime()}`,
      payment_capture: 1,         // Automatically capture payment after success
    });

    if (!razorpayOrder) {
      return res.status(500).json({
        success: false,
        message: "Failed to create Razorpay order",
      });
    }

    // Create an order in your database
    const newlyCreatedOrder = new Order({
      userId,
      userName,  // Include username in the order data
      cartId,
      cartItems,
      addressInfo,
      orderStatus,
      paymentMethod,  // Razorpay payment method
      paymentStatus,
      totalAmount,
      orderDate,
      orderUpdateDate,
      paymentId: razorpayOrder.id,  // Save Razorpay order ID
      payerId,
    });

    await newlyCreatedOrder.save();

    res.status(201).json({
      success: true,
      message: "Order created successfully. Proceed with Razorpay payment.",
      orderId: newlyCreatedOrder._id,
      razorpayOrderId: razorpayOrder.id,  // Send Razorpay order ID to the frontend
      razorpayKeyId: razorpay.key_id,    // Send Razorpay key ID to the frontend
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({
      success: false,
      message: "Error occurred while creating the order.",
    });
  }
};

const capturePayment = async (req, res) => {
  try {
    const { paymentId, payerId, orderId } = req.body;

    let order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Fetch Razorpay payment details using paymentId
    const razorpayPayment = await razorpayInstance.payments.fetch(paymentId);

    // Check if the payment is successful
    if (razorpayPayment.status !== "captured") {
      return res.status(400).json({
        success: false,
        message: "Payment failed or not captured.",
      });
    }

    // Update order with payment details
    order.paymentStatus = "paid"; // Mark payment as successful
    order.orderStatus = "confirmed"; // Mark order as confirmed
    order.paymentId = razorpayPayment.id; // Save Razorpay payment ID
    order.payerId = payerId; // Save the payer's ID

    // Update stock based on the order items
    for (let item of order.cartItems) {
      let product = await Product.findById(item.productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.title}`,
        });
      }

      if (product.totalStock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Not enough stock for product: ${item.title}`,
        });
      }

      // Deduct stock after successful payment
      product.totalStock -= item.quantity;
      await product.save();
    }

    // Delete the cart after successful order placement
    await Cart.findByIdAndDelete(order.cartId);

    // Save the updated order
    await order.save();

    res.status(200).json({
      success: true,
      message: "Payment captured and order confirmed successfully.",
      data: order,
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({
      success: false,
      message: "Error occurred while capturing the payment.",
    });
  }
};


const getAllOrdersByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const orders = await Order.find({ userId });

    if (!orders.length) {
      return res.status(404).json({
        success: false,
        message: "No orders found!",
      });
    }

    res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({
      success: false,
      message: "Error occurred while fetching orders.",
    });
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found!",
      });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({
      success: false,
      message: "Error occurred while fetching order details.",
    });
  }
};

module.exports = {
  createOrder,
  capturePayment,
  getAllOrdersByUser,
  getOrderDetails,
};
