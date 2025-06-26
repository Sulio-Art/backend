import Setting from '../model/settings.Models.js';

const getMySettings = async (req, res) => {
  try {
    let settings = await Setting.findOne({ userId: req.user.id });

    if (!settings) {
      settings = await Setting.create({ userId: req.user.id });
    }

    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

const updateMySettings = async (req, res) => {
  try {
    const { theme, notificationsEnabled, language } = req.body;
    
    const settings = await Setting.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { theme, notificationsEnabled, language } },
      { new: true, upsert: true, runValidators: true }
    );
    
    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

export {
  getMySettings,
  updateMySettings,
};