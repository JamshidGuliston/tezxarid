from rest_framework import serializers
from .models import Category, CityProduct


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'image', 'sort_order']


class CityProductSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source='product.id', read_only=True)
    city_product_id = serializers.IntegerField(source='id', read_only=True)
    name = serializers.CharField(source='product.name', read_only=True)
    image = serializers.ImageField(source='product.image', read_only=True)
    unit = serializers.CharField(source='product.unit', read_only=True)
    step = serializers.DecimalField(source='product.step', max_digits=6, decimal_places=3, read_only=True)
    category = serializers.IntegerField(source='product.category_id', read_only=True)

    class Meta:
        model = CityProduct
        fields = ['id', 'city_product_id', 'name', 'image', 'unit', 'step',
                  'category', 'price', 'is_available', 'stock']
