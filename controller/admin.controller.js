import User from '../model/user.model.js';
import Event from '../model/eventManagment.Model.js';
import Transaction from '../model/transaction.Model.js';

export const getAdminDashboardStats = async (req, res) => {
    try {
       
        const activeCustomers = await User.countDocuments({ subscriptionStatus: 'active' });
        const totalCustomers = await User.countDocuments();

        
        const activeEvents = await Event.countDocuments({ date: { $gte: new Date() } });
        const totalEvents = await Event.countDocuments();

      
        const totalTransactions = await Transaction.countDocuments();

      
        const recentTransactions = await Transaction.find({})
            .populate('userId', 'firstName lastName')
            .sort({ createdAt: -1 })
            .limit(5);

        const liveEvents = await Event.find({ date: { $gte: new Date() } })
            .populate('userId', 'firstName lastName')
            .sort({ date: 'asc' }) 
            .limit(5);

        res.status(200).json({
            activeCustomers,
            totalCustomers,
            activeEvents,
            totalEvents,
            totalTransactions,
            recentTransactions,
            liveEvents,
        });

    } catch (error) {
        console.error("Admin Dashboard Stats Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
};