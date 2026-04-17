'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('telegram_message_images', 'text_extraction_status', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'pending',
    });

    await queryInterface.addColumn('telegram_message_images', 'text_extraction_model', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('telegram_message_images', 'text_extracted_lines', {
      type: Sequelize.JSONB,
      allowNull: true,
    });

    await queryInterface.addColumn('telegram_message_images', 'text_extraction_error', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn('telegram_message_images', 'text_extracted_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('telegram_message_images', 'text_extracted_at');
    await queryInterface.removeColumn('telegram_message_images', 'text_extraction_error');
    await queryInterface.removeColumn('telegram_message_images', 'text_extracted_lines');
    await queryInterface.removeColumn('telegram_message_images', 'text_extraction_model');
    await queryInterface.removeColumn('telegram_message_images', 'text_extraction_status');
  },
};
